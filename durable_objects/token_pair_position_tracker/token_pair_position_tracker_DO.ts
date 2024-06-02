import { isAdminOrSuperAdmin } from "../../admins";
import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import { makeJSONResponse, makeSuccessResponse } from "../../http";
import { logDebug, logError } from "../../logging";
import { TokenInfo } from "../../tokens";
import { ChangeTrackedValue, assertNever } from "../../util";
import { isValidTokenInfoResponse } from "../polled_token_pair_list/actions/get_token_info";
import { getTokenInfo } from "../polled_token_pair_list/polled_token_pair_list_DO_interop";
import { AdminDeleteAllInTrackerRequest, AdminDeleteAllInTrackerResponse } from "./actions/admin_delete_all_positions_in_tracker";
import { AdminDeleteClosedPositionsForUserInTrackerRequest, AdminDeleteClosedPositionsForUserInTrackerResponse } from "./actions/admin_delete_closed_positions_for_user_in_tracker";
import { AdminDeletePositionByIDFromTrackerRequest, AdminDeletePositionByIDFromTrackerResponse } from "./actions/admin_delete_position_by_id_from_tracker";
import { GetDeactivatedPositionFromTrackerRequest, GetDeactivatedPositionFromTrackerResponse } from "./actions/get_frozen_position";
import { GetPositionFromPriceTrackerRequest, GetPositionFromPriceTrackerResponse } from "./actions/get_position";
import { GetPositionAndMaybePNLFromPriceTrackerRequest, GetPositionAndMaybePNLFromPriceTrackerResponse } from "./actions/get_position_and_maybe_pnl";
import { GetPositionCountsFromTrackerRequest, GetPositionCountsFromTrackerResponse } from "./actions/get_position_counts_from_tracker";
import { GetTokenPriceRequest, GetTokenPriceResponse } from "./actions/get_token_price";
import { HasPairAddresses } from "./actions/has_pair_addresses";
import { isHeartbeatRequest } from "./actions/heartbeat_wake_up_for_token_pair_position_tracker";
import { InsertPositionRequest, InsertPositionResponse } from "./actions/insert_position";
import { ListClosedPositionsFromTrackerRequest, ListClosedPositionsFromTrackerResponse } from "./actions/list_closed_positions_from_tracker";
import { ListDeactivatedPositionsInTrackerRequest, ListDeactivatedPositionsInTrackerResponse } from "./actions/list_frozen_positions_in_tracker";
import { ListPositionsByUserRequest, ListPositionsByUserResponse } from "./actions/list_positions_by_user";
import { PositionExistsInTrackerRequest, PositionExistsInTrackerResponse } from "./actions/position_exists_in_tracker";
import { RemovePositionRequest, RemovePositionResponse } from "./actions/remove_position";
import { UpdatePositionRequest, UpdatePositionResponse } from "./actions/update_position";
import { WakeupTokenPairPositionTrackerRequest, WakeupTokenPairPositionTrackerResponse } from "./actions/wake_up";
import { PositionAndMaybePNL } from "./model/position_and_PNL";
import { TokenPairPositionTrackerDOFetchMethod, parseTokenPairPositionTrackerDOFetchMethod } from "./token_pair_position_tracker_DO_interop";
import { CurrentPriceTracker } from "./trackers/current_price_tracker";
import { ActionsToTake, TokenPairPositionTracker } from "./trackers/token_pair_position_tracker";
/*
    Big TODO: How do we limit concurrent outgoing requests when a dip happens?
    This is a big burst and may trip limits.
    Should we shard a token-pair position tracker once a certain number of positions exist?
    i.e.; USDCaddr-CHONKYaddr-1,  USDCaddr-CHONKYaddr-2, etc.

    Also, is it possible to have cron job execution on DOs?
    Or do I need to hack something together with alarms?
*/


/* 
    Durable Object storing all open positions for a single token/vsToken pair.  
    Triggers appropriate actions when price updates. 
    Also serves as point of contact for RPC
*/
export class TokenPairPositionTrackerDO {

    // persistence for this durable object
    state :   DurableObjectState;

    // initialized properties - token and the 'swap-from' vsToken (i.e; USDC)
    tokenAddress :   ChangeTrackedValue<string|null> = new ChangeTrackedValue<string|null>("tokenAddress",null);
    vsTokenAddress : ChangeTrackedValue<string|null> = new ChangeTrackedValue<string|null>("vsTokenAddress",null);

    tokenInfo : ChangeTrackedValue<TokenInfo|null> = new ChangeTrackedValue<TokenInfo|null>("tokenInfo", null);
    
    
    // this performs all the book keeping and determines what RPC actions to take
    // THIS WILL BE REMOVED SHORTLY.
    tokenPairPositionTracker : TokenPairPositionTracker = new TokenPairPositionTracker();
    
    // this contains (and queries for) the current price of the pair in $token/$vsToken
    currentPriceTracker : CurrentPriceTracker = new CurrentPriceTracker();

    // when the DO loads up, it registers itself with HeartbeatDO
    // (which later sends heartbeat requests to keep the DO awake)

    // deliberately not change tracked, so we can register with heartbeat on cold start.
    //needsToEnsureIsRegistered : boolean = true 
    
    lastTimeMSRegisteredWithHeartbeat : ChangeTrackedValue<number> = new ChangeTrackedValue<number>("lastTimeMSRegisteredWithHeartbeat",0);
    
    isPolling : boolean = false; // deliberately not change tracked.

    env : Env;

    constructor(state : DurableObjectState, env : Env) {

        this.state       = state; // access to persistent storage (as opposed to in-memory)
        this.env         = env;
        this.state.blockConcurrencyWhile(async () => {
            await this.loadStateFromStorage(this.state.storage);
        });
    }

    async loadStateFromStorage(storage : DurableObjectStorage) {
        //logDebug("Loading token_pair_position_tracker from storage");
        const entries = await storage.list();
        this.tokenAddress.initialize(entries);
        this.vsTokenAddress.initialize(entries);
        this.tokenInfo.initialize(entries);
        this.tokenPairPositionTracker.initialize(entries);
        this.currentPriceTracker.initialize(entries);
        //logDebug("Loaded token_pair_position_tracker from storage");
    }

    async flushToStorage() {

        const captureError = (name : string) => async (e : any) => {
            logError(`CRITICAL: flushToStorage - ${name} - failed!!!`, e);
            throw e;
        }
        await Promise.allSettled([
            await this.tokenAddress.flushToStorage(this.state.storage).catch(captureError("tokenAddress")),
            await this.vsTokenAddress.flushToStorage(this.state.storage).catch(captureError("vsTokenAddress")),
            await this.tokenInfo.flushToStorage(this.state.storage).catch(captureError("tokenInfo")),
            await this.tokenPairPositionTracker.flushToStorage(this.state.storage).catch(captureError("tokenPairPositionTracker")),
            await this.currentPriceTracker.flushToStorage(this.state.storage).catch(captureError("currentPriceTracker"))
        ]).then(() => {
            //logDebug("Finished flushing tokenPairPositionTracker to storage.")
        });
    }

    hasTokenAddresses() : this is { vsTokenAddress : { value : string }, tokenAddress : { value : string } } {
        return  this.vsTokenAddress.value != null && 
                this.tokenAddress.value != null;
    }

    async getPrice() : Promise<DecimalizedAmount|null> {
        if (this.tokenAddress.value == null || this.vsTokenAddress.value == null) {
            return null;
        }
        await this.tryEnsureTokenInfo();
        if (this.tokenInfo.value == null) {
            return null;
        }
        const result = await this.currentPriceTracker.getPrice(this.tokenInfo.value, this.vsTokenAddress.value, this.env)
        if (result != null) {
            const [price,isNew] = result;
            /*if (isNew) {
                this.tokenPairPositionTracker.updatePrice(price);
            }*/
            return price;
        } 
        return null;
    }

    private async tryEnsureTokenInfo() : Promise<void> {
        if (this.tokenInfo.value == null && this.tokenAddress.value != null) {
            const tokenInfoResponse = await getTokenInfo(this.tokenAddress.value, this.env);
            if (isValidTokenInfoResponse(tokenInfoResponse)) {
                this.tokenInfo.value = tokenInfoResponse.tokenInfo;
            }
        }
    }

    tokenPairID() : string {
        return `${this.tokenAddress.value}:${this.vsTokenAddress.value}`;
    }

    async fetch(request : Request) : Promise<Response> {
        const [method,body] = await this.validateFetchRequest(request);
        logDebug(`[[${method}]] :: tracker :: ${(this.tokenAddress.value||'').slice(0,10)}`);
        try {
            // ONLY DEV! this.__xDELETE_ALL_POSITIONSx(); // ONLY DEV!
            const response = await this._fetch(method,body);
            return response;
        }
        catch(e : any) {
            logError("Error in fetch for tokenPairPositionTracker", e, this.tokenAddress, this.vsTokenAddress);
        }
        finally {
            await this.flushToStorage();
            //logDebug(`FINISHED ${method} - ${this.tokenAddress.value}`);
        }
        return makeSuccessResponse();
    }

    // This has been useful during dev
    /*__DELETE_ALL_POSITIONS() {
        throw new Error("");
        if (this.env.ENVIRONMENT !== 'dev') {
            return;
        }
        logError("Deleting all positions", this);
        const positionIDs = [...this.tokenPairPositionTracker.pricePeaks.itemsByPeakPrice.positionIDMap.keys()];
        for (const positionID of positionIDs) {
            this.tokenPairPositionTracker.removePosition(positionID);
        }
    }*/

    async _fetch(method : TokenPairPositionTrackerDOFetchMethod, body : any) : Promise<Response> {
        switch(method) {                
            case TokenPairPositionTrackerDOFetchMethod.wakeUp:
                return await this.handleWakeup(body);
            case TokenPairPositionTrackerDOFetchMethod.getTokenPrice:
                return await this.handleGetTokenPrice(body);
            case TokenPairPositionTrackerDOFetchMethod.listPositionsByUser:
                return await this.handleListPositionsByUser(body);
            case TokenPairPositionTrackerDOFetchMethod.removePosition:
                return await this.handleRemovePosition(body);
            case TokenPairPositionTrackerDOFetchMethod.getPositionAndMaybePNL:
                return await this.handleGetPositionAndMaybePNL(body);
            case TokenPairPositionTrackerDOFetchMethod.getPosition:
                return await this.handleGetPosition(body);
            case TokenPairPositionTrackerDOFetchMethod.adminDeleteAllInTracker:
                return await this.handleAdminDeleteAllInTracker(body);
            case TokenPairPositionTrackerDOFetchMethod.positionExists:
                return await this.handlePositionExistsInTracker(body);
            case TokenPairPositionTrackerDOFetchMethod.listClosedPositionsFromTracker:
                return await this.handleListClosedPositionsFromTracker(body);
            case TokenPairPositionTrackerDOFetchMethod.insertPosition:
                return await this.handleInsertPosition(body);
            case TokenPairPositionTrackerDOFetchMethod.updatePosition:
                return await this.handleUpdatePosition(body);
            case TokenPairPositionTrackerDOFetchMethod.getPositionCounts:
                return await this.handleGetPositionCounts(body);
            case TokenPairPositionTrackerDOFetchMethod.adminDeleteClosedPositionsForUser:
                return await this.handleAdminDeleteClosedPositionsForUser(body);
            case TokenPairPositionTrackerDOFetchMethod.adminDeletePositionByIDFromTracker:
                return await this.handleAdminDeletePositionByID(body);
            case TokenPairPositionTrackerDOFetchMethod.listDeactivatedPositions:
                return await this.handleListDeactivatedPositions(body);
            case TokenPairPositionTrackerDOFetchMethod.getDeactivatedPosition:
                return await this.handleGetDeactivatedPosition(body);
            default:
                assertNever(method);
        }
    }

    
    async handleGetDeactivatedPosition(body: GetDeactivatedPositionFromTrackerRequest) : Promise<Response> {
        const deactivatedPosition = this.tokenPairPositionTracker.getDeactivatedPosition(body.telegramUserID, body.positionID);
        return makeJSONResponse<GetDeactivatedPositionFromTrackerResponse>({ deactivatedPosition });
    }

    async handleListDeactivatedPositions(body: ListDeactivatedPositionsInTrackerRequest) : Promise<Response> {
        const deactivatedPositions = this.tokenPairPositionTracker.listDeactivatedPositionsByUser(body.userID);
        return makeJSONResponse<ListDeactivatedPositionsInTrackerResponse>({ deactivatedPositions });
    }

    async handleAdminDeletePositionByID(body : AdminDeletePositionByIDFromTrackerRequest) : Promise<Response> {
        const removedPosition = this.tokenPairPositionTracker.removePosition(body.positionID);
        if (removedPosition != null) {
            return makeJSONResponse<AdminDeletePositionByIDFromTrackerResponse>({ success : true })
        }
        else {
            return makeJSONResponse<AdminDeletePositionByIDFromTrackerResponse>({ success: false })
        }
    }

    async handleAdminDeleteClosedPositionsForUser(userAction: AdminDeleteClosedPositionsForUserInTrackerRequest) : Promise<Response> {
        this.tokenPairPositionTracker.deleteClosedPositionsForUser(userAction.telegramUserID);
        const response : AdminDeleteClosedPositionsForUserInTrackerResponse = {};
        return makeJSONResponse<AdminDeleteClosedPositionsForUserInTrackerResponse>(response);
    }

    async handleGetPositionCounts(body : GetPositionCountsFromTrackerRequest) : Promise<Response> {
        const positionCounts : Record<string,number> = {};
        const countsByUser : Record<number,number> = {};
        const allPositions = this.tokenPairPositionTracker.listAllPositions();
        for (const position of allPositions) {
            if (!(position.status in positionCounts)) {
                positionCounts[position.status] = 0;
            }
            positionCounts[position.status] += 1;

            const userID = position.userID;
            if (!(userID in countsByUser)) {
                countsByUser[userID] = 0;
            }
            countsByUser[userID] += 1;
        }
        return makeJSONResponse<GetPositionCountsFromTrackerResponse>({ positionCounts, countsByUser });
    }

    async handleInsertPosition(body: InsertPositionRequest) : Promise<Response> {
        const currentPrice = await this.getPrice();
        if (currentPrice == null) {
            return makeJSONResponse<InsertPositionResponse>({ success: false });
        }
        const success = this.tokenPairPositionTracker.insertPosition(body.position, currentPrice);
        return makeJSONResponse<InsertPositionResponse>({ success });
    }

    async handleUpdatePosition(body: UpdatePositionRequest) : Promise<Response> {
        const success = this.tokenPairPositionTracker.updatePosition(body.position);
        return makeJSONResponse<UpdatePositionResponse>({ success })
    }

    async handleListClosedPositionsFromTracker(body : ListClosedPositionsFromTrackerRequest) : Promise<Response> {
        const closedPositions = this.tokenPairPositionTracker.listClosedPositionsForUser(body.telegramUserID);
        const response : ListClosedPositionsFromTrackerResponse = { closedPositions: closedPositions };
        return makeJSONResponse<ListClosedPositionsFromTrackerResponse>(response);
    }

    async handlePositionExistsInTracker(body : PositionExistsInTrackerRequest) : Promise<Response> {
        const pos = this.tokenPairPositionTracker.getPosition(body.positionID);
        const responseBody : PositionExistsInTrackerResponse = { exists : pos != null };
        return makeJSONResponse<PositionExistsInTrackerResponse>(responseBody);
    }

    async handleAdminDeleteAllInTracker(body: AdminDeleteAllInTrackerRequest) : Promise<Response> {
        // this is really the nuclear option.  that's why I'm putting these checks in place.
        if (this.env.ENVIRONMENT === 'dev') {
            const userID = body.userID;
            if (!isAdminOrSuperAdmin(userID,this.env)) {
                return makeJSONResponse<AdminDeleteAllInTrackerResponse>({});
            }
            this.tokenPairPositionTracker.__clearAllPositions();
            return makeJSONResponse<AdminDeleteAllInTrackerResponse>({});
        }
        return makeJSONResponse<AdminDeleteAllInTrackerResponse>({});
    }

    async handleGetPosition(body: GetPositionFromPriceTrackerRequest) : Promise<Response> {
        const positionID = body.positionID;
        const maybePosition = this.tokenPairPositionTracker.getPosition(positionID);
        const response : GetPositionFromPriceTrackerResponse = { maybePosition: maybePosition };
        return makeJSONResponse(response);
    }

    async handleGetPositionAndMaybePNL(body : GetPositionAndMaybePNLFromPriceTrackerRequest) : Promise<Response> {
        const maybePosition = await this.handleGetPositionAndMaybePNLInternal(body);
        const response : GetPositionAndMaybePNLFromPriceTrackerResponse = { maybePosition };
        return makeJSONResponse(response);
    }

    async handleGetPositionAndMaybePNLInternal(body: GetPositionAndMaybePNLFromPriceTrackerRequest) : Promise<PositionAndMaybePNL|undefined> {
        if (!this.hasTokenAddresses()) {
            return undefined;
        }
        const positionID = body.positionID;
        const currentPrice = await this.getPrice();
        const maybePosition = this.tokenPairPositionTracker.getPositionAndMaybePNL(positionID, currentPrice);
        return maybePosition;
    }

    async handleRemovePosition(body: RemovePositionRequest) : Promise<Response> {
        const positionID = body.positionID;
        this.tokenPairPositionTracker.removePosition(positionID);
        const response : RemovePositionResponse = {};
        return makeJSONResponse(response);
    }

    async handleListPositionsByUser(body: ListPositionsByUserRequest) : Promise<Response> {
        const positions = await this.handleListPositionsByUserInternal(body);
        const response : ListPositionsByUserResponse = {
            positions: positions
        }
        return makeJSONResponse<ListPositionsByUserResponse>(response);
    }

    async handleListPositionsByUserInternal(body: ListPositionsByUserRequest) : Promise<PositionAndMaybePNL[]> {
        if (!this.hasTokenAddresses()) {
            logError("Tried to list positions yet tokenPairPositionTracker wasn't initialized", this);
            return [];
        }
        const currentPrice = await this.getPrice();
        const userID = body.telegramUserID;
        const positions = this.tokenPairPositionTracker.listByUser(userID, currentPrice);
        return positions;
    }

    async handleGetTokenPrice(body : GetTokenPriceRequest) : Promise<Response> {
        if (this.tokenAddress.value == null || this.vsTokenAddress.value == null) {
            throw new Error("Couldn't get token price because token pair addresses not initialized");
        }
        const price = await this.getPrice();
        return makeJSONResponse<GetTokenPriceResponse>({ price : price });
    }

    async handleWakeup(body : WakeupTokenPairPositionTrackerRequest) {
        // this is a no-op, because by simply calling a request we wake up the DO
        const responseBody : WakeupTokenPairPositionTrackerResponse = {};
        return makeJSONResponse(responseBody);
    }

    async validateFetchRequest(request : Request) : Promise<[TokenPairPositionTrackerDOFetchMethod,any]> {
        const jsonBody : any = await request.json();
        const methodName = new URL(request.url).pathname.substring(1);
        const method : TokenPairPositionTrackerDOFetchMethod|null = parseTokenPairPositionTrackerDOFetchMethod(methodName);
        if (method == null) {
            throw new Error(`Unknown method ${method}`);
        }
        // NOTE: A heartbeat request is the only exception to the rule
        // that all requests must have tokenAddress and vsTokenAddress identified.
        if (!(isHeartbeatRequest(jsonBody))) {
            const tokenAddress = jsonBody.tokenAddress;
            const vsTokenAddress = jsonBody.vsTokenAddress;
            if (this.tokenAddress.value != null && tokenAddress != this.tokenAddress.value) {
                throw new Error(`tokenAddress did not match expected tokenAddress. Expected: ${this.tokenAddress.value} Was: ${tokenAddress}`);
            }
            if (this.vsTokenAddress.value != null && vsTokenAddress != this.vsTokenAddress.value) {
                throw new Error(`vsTokenAddress did not match expected vsTokenAddress. Expected: ${this.vsTokenAddress.value} Was: ${vsTokenAddress}`);
            }
            this.tokenAddress.value = tokenAddress;
            this.vsTokenAddress.value = vsTokenAddress;
        }
        return [method,jsonBody];
    }

    assertIsInitialized() {
        if (!this.hasTokenAddresses()) {
            throw new Error("Must initialized before using");
        }
    }

    updatePositionTracker(newPrice : DecimalizedAmount) : ActionsToTake {
        this.tokenPairPositionTracker.updatePrice(newPrice);
        const positionsToClose = this.tokenPairPositionTracker.collectPositionsToClose(newPrice);
        const unconfirmedBuys = this.tokenPairPositionTracker.getUnconfirmedBuys();
        const unconfirmedSells = this.tokenPairPositionTracker.getUnconfirmedSells();
        const actionsToTake = {
            positionsToClose: positionsToClose,
            buysToConfirm: unconfirmedBuys,
            sellsToConfirm : unconfirmedSells
        };
        return actionsToTake;
    }
    
    ensureIsInitialized(x : HasPairAddresses) {
        this.tokenAddress.value = x.tokenAddress;
        this.vsTokenAddress.value = x.vsTokenAddress;
    }
}