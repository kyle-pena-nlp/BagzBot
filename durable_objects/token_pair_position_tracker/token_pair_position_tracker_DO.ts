import { Connection } from "@solana/web3.js";
import { isAdminOrSuperAdmin } from "../../admins";
import { DecimalizedAmount, dSub } from "../../decimalized";
import { asTokenPrice, asTokenPriceDelta, toNumber } from "../../decimalized/decimalized_amount";
import { Env, getRPCUrl } from "../../env";
import { makeJSONResponse, makeSuccessResponse } from "../../http";
import { logDebug, logError, logInfo } from "../../logging";
import { MenuCode } from "../../menus";
import { Position, PositionStatus } from "../../positions";
import { isSuccessfullyParsedSwapSummary } from "../../rpc/rpc_swap_parse_result_types";
import { TGStatusMessage } from "../../telegram";
import { ChangeTrackedValue, assertNever, strictParseBoolean, strictParseInt } from "../../util";
import { ensureTokenPairIsRegistered } from "../heartbeat/heartbeat_do_interop";
import { EditTriggerPercentOnOpenPositionResponse } from "../user/actions/edit_trigger_percent_on_open_position";
import { SetSellAutoDoubleOnOpenPositionResponse } from "../user/actions/set_sell_auto_double_on_open_position";
import { SellSellSlippagePercentageOnOpenPositionResponse } from "../user/actions/set_sell_slippage_percent_on_open_position";
import { sendClosePositionOrdersToUserDOs } from "../user/userDO_interop";
import { ReactivatePositionInTrackerRequest, ReactivatePositionInTrackerResponse } from "./actions/activate_position_in_tracker";
import { AdminDeleteAllInTrackerRequest, AdminDeleteAllInTrackerResponse } from "./actions/admin_delete_all_positions_in_tracker";
import { AdminDeleteClosedPositionsForUserInTrackerRequest, AdminDeleteClosedPositionsForUserInTrackerResponse } from "./actions/admin_delete_closed_positions_for_user_in_tracker";
import { AdminDeletePositionByIDFromTrackerRequest, AdminDeletePositionByIDFromTrackerResponse } from "./actions/admin_delete_position_by_id_from_tracker";
import { DeactivatePositionInTrackerRequest, DeactivatePositionInTrackerResponse } from "./actions/deactivate_position_in_tracker";
import { DoubleSellSlippageInTrackerRequest, DoubleSellSlippageInTrackerResponse } from "./actions/double_sell_slippage_in_tracker";
import { EditTriggerPercentOnOpenPositionInTrackerRequest } from "./actions/edit_trigger_percent_on_open_position_in_tracker";
import { GetDeactivatedPositionFromTrackerRequest, GetDeactivatedPositionFromTrackerResponse } from "./actions/get_frozen_position";
import { GetPositionFromPriceTrackerRequest, GetPositionFromPriceTrackerResponse } from "./actions/get_position";
import { GetPositionAndMaybePNLFromPriceTrackerRequest, GetPositionAndMaybePNLFromPriceTrackerResponse } from "./actions/get_position_and_maybe_pnl";
import { GetPositionCountsFromTrackerRequest, GetPositionCountsFromTrackerResponse } from "./actions/get_position_counts_from_tracker";
import { GetTokenPriceRequest, GetTokenPriceResponse } from "./actions/get_token_price";
import { HasPairAddresses } from "./actions/has_pair_addresses";
import { isHeartbeatRequest } from "./actions/heartbeat_wake_up_for_token_pair_position_tracker";
import { IncrementOtherSellFailureCountInTrackerRequest, IncrementOtherSellFailureCountInTrackerResponse } from "./actions/increment_other_sell_failure_count_in_tracker";
import { InsertPositionRequest, InsertPositionResponse } from "./actions/insert_position";
import { ListClosedPositionsFromTrackerRequest, ListClosedPositionsFromTrackerResponse } from "./actions/list_closed_positions_from_tracker";
import { ListDeactivatedPositionsInTrackerRequest, ListDeactivatedPositionsInTrackerResponse } from "./actions/list_frozen_positions_in_tracker";
import { ListPositionsByUserRequest, ListPositionsByUserResponse } from "./actions/list_positions_by_user";
import { MarkBuyAsConfirmedRequest, MarkBuyAsConfirmedResponse } from "./actions/mark_buy_as_confirmed";
import { MarkPositionAsClosedRequest, MarkPositionAsClosedResponse } from "./actions/mark_position_as_closed";
import { MarkPositionAsClosingRequest, MarkPositionAsClosingResponse } from "./actions/mark_position_as_closing";
import { MarkPositionAsOpenRequest, MarkPositionAsOpenResponse } from "./actions/mark_position_as_open";
import { PositionExistsInTrackerRequest, PositionExistsInTrackerResponse } from "./actions/position_exists_in_tracker";
import { RemovePositionRequest, RemovePositionResponse } from "./actions/remove_position";
import { SetSellAutoDoubleOnOpenPositionInTrackerRequest } from "./actions/set_sell_auto_double_on_open_position_in_tracker";
import { SetSellSlippagePercentOnOpenPositionTrackerRequest } from "./actions/set_sell_slippage_percent_on_open_position";
import { UpdatePositionRequest, UpdatePositionResponse } from "./actions/update_position";
import { UpdatePriceRequest, UpdatePriceResponse } from "./actions/update_price";
import { WakeupTokenPairPositionTrackerRequest, WakeupTokenPairPositionTrackerResponse } from "./actions/wake_up";
import { BuyConfirmer } from "./confirmers/buy_confirmer";
import { SellConfirmer } from "./confirmers/sell_confirmer";
import { PositionAndMaybePNL } from "./model/position_and_PNL";
import { TokenPairPositionTrackerDOFetchMethod, parseTokenPairPositionTrackerDOFetchMethod } from "./token_pair_position_tracker_do_interop";
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
    
    
    // this performs all the book keeping and determines what RPC actions to take
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
            await this.tokenPairPositionTracker.flushToStorage(this.state.storage).catch(captureError("tokenPairPositionTracker")),
            await this.currentPriceTracker.flushToStorage(this.state.storage).catch(captureError("currentPriceTracker"))
        ]).then(() => {
            //logDebug("Finished flushing tokenPairPositionTracker to storage.")
        });
    }

    shouldBePolling() : boolean {
        if (strictParseBoolean(this.env.DOWN_FOR_MAINTENANCE)) {
            return false;
        }
        if (!strictParseBoolean(this.env.POLLING_ON)) {
            //logDebug(`${this.tokenPairID()} Price polling is turned off AND should not be price polling.`)
            return false;
        }
        if (!this.initialized()) {
            //logDebug(`${this.tokenPairID()} not initialized AND should not be price polling.`)
            return false;
        }
        const anyPositionsToTrack = this.tokenPairPositionTracker.any();
        if (!anyPositionsToTrack) {
            //logDebug(`${this.tokenPairID()} - No positions to track AND should not be price polling.`);
            return false;
        }
        return true;
    }

    initialized() : this is { vsTokenAddress : { value : string }, tokenAddress : { value : string } } {
        return  this.vsTokenAddress.value != null && 
                this.tokenAddress.value != null;
    }

    async alarm() {
        //logDebug(`Invoking alarm. ${this.tokenAddress.value}`);        
        try {
            await this._alarm();
        }
        catch(e : any) {
            logError("alarm execution failed", this.tokenPairID(), e);
        }
        finally {
            await this.flushToStorage();
            //logDebug(`Finished Invoking alarm. ${this.tokenAddress.value}`);
        }
    }

    async _alarm() {
        if (this.tokenAddress.value == null || this.vsTokenAddress.value == null) {
            throw new Error("Couldn't get token price because token pair addresses not initialized");
        }        
        const beginExecutionTime = Date.now();
        await this.state.storage.deleteAlarm();
        try {
            const price = await this.getPrice();
            if (price != null) {
                await this.performTriggeredPriceUpdateActions({ price, tokenAddress: this.tokenAddress.value, vsTokenAddress: this.vsTokenAddress.value });
            }
            else {
                logError("Could not retrieve price", this);
            }
        }
        catch(e) {
            logError("Price polling failed.", e, this.tokenAddress, this.vsTokenAddress);
        }
        if (!this.shouldBePolling()) {
            logDebug(`Turning off polling for ${this.tokenPairID()} - no longer needed`)
            this.isPolling = false;
            return;
        }
        else {
            await this.scheduleNextPoll(beginExecutionTime);
        }
    }

    async getPrice() : Promise<DecimalizedAmount|null> {
        if (this.tokenAddress.value == null || this.vsTokenAddress.value == null) {
            return null;
        }
        const result = await this.currentPriceTracker.getPrice(this.tokenAddress.value, this.vsTokenAddress.value)
        if (result != null) {
            const [price,isNew] = result;
            if (isNew) {
                this.tokenPairPositionTracker.updatePrice(price);
            }
            return price;
        } 
        return null;
    }

    tokenPairID() : string {
        return `${this.tokenAddress.value}:${this.vsTokenAddress.value}`;
    }

    async scheduleNextPoll(begin : number) {
        this.isPolling = true;
        const end = Date.now();
        const elapsed = end - begin;
        const pricePollInterval = strictParseInt(this.env.PRICE_POLL_INTERVAL_MS);
        if (elapsed > pricePollInterval) {
            logInfo("Tracker ran longer than 1s", this.tokenAddress, this.vsTokenAddress);
        }
        const remainder = elapsed % pricePollInterval;
        const nextAlarm = pricePollInterval - remainder;
        const alarmTime = Date.now() + nextAlarm;
        await this.state.storage.setAlarm(alarmTime);
    }

    async fetch(request : Request) : Promise<Response> {
        const [method,body] = await this.validateFetchRequest(request);
        logDebug(`[[${method}]] :: tracker :: ${(this.tokenAddress.value||'').slice(0,10)}`);
        try {
            // ensure the token is registered with heartbeatDO
            if (!isHeartbeatRequest(body)) {
                this.tryToEnsureTokenPairIsRegistered();
            }
            // ONLY DEV! this.__xDELETE_ALL_POSITIONSx(); // ONLY DEV!
            const response = await this._fetch(method,body);
            this.ensureIsPollingPrice();
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

    async ensureIsPollingPrice() {
        const shouldBePolling = this.shouldBePolling();
        if (shouldBePolling && !this.isPolling) {
            logDebug(`${this.tokenPairID()} - not price polling and should be. scheduling next price poll.`)
            this.scheduleNextPoll(Date.now());
        }
        else if (shouldBePolling && this.isPolling) {
            // too chatty
            //logDebug("Price polling should be on and *is* on - no polling scheduling necessary");
        }
        else if (!shouldBePolling && this.isPolling) {
            logDebug(`${this.tokenPairID()} - price polling is on but shouldn't be - not rescheduling polling`);
        }
        else if (!shouldBePolling && !this.isPolling) {
            // too chatty
            //logDebug(`${this.tokenPairID()} - price polling not activated, polling already turned off`);
        }
    }

    async tryToEnsureTokenPairIsRegistered() {
        if (this.needsToEnsureIsRegistered()) {
            const tokenAddress = this.tokenAddress.value;
            const vsTokenAddress = this.vsTokenAddress.value;
            if (tokenAddress == null) {
                logError(`Could not register ${this.tokenPairID()} with heartBeat - tokenAddress was null`);
                return;
            }
            if (vsTokenAddress == null) {
                logError(`Could not register ${this.tokenPairID()} with heartBeat - vsTokenAddress was null`);
                return;
            }
            //logDebug(`Registering token pair ${this.tokenPairID()}`);
            await ensureTokenPairIsRegistered(tokenAddress, vsTokenAddress, this.env).then(() => {
                //this.needsToEnsureIsRegistered = false;
                this.lastTimeMSRegisteredWithHeartbeat.value = Date.now();
                //logDebug(`Token pair ${tokenAddress}:${vsTokenAddress} is now registered with heartbeat!`);
            })
        }
    }

    needsToEnsureIsRegistered() : boolean {
        // Only need to ensure registered with heartbeat if haven't done so in 1 min
        // heartbeat touches the tracker to make sure it is scheduling alarms if it needs to
        // if only DO's had CRON jobs :(
        // TODO: configurable?
        return (Date.now() - this.lastTimeMSRegisteredWithHeartbeat.value) > 60000;
    }

    async _fetch(method : TokenPairPositionTrackerDOFetchMethod, body : any) : Promise<Response> {
        switch(method) {
            case TokenPairPositionTrackerDOFetchMethod.updatePrice:
                return await this.performTriggeredPriceUpdateActions(body);
            case TokenPairPositionTrackerDOFetchMethod.markPositionAsClosing:
                return await this.handleMarkPositionAsClosing(body);
            case TokenPairPositionTrackerDOFetchMethod.markPositionAsClosed:
                return await this.handleMarkPositionAsClosed(body);
            case TokenPairPositionTrackerDOFetchMethod.markPositionAsOpen:
                return await this.handleMarkPositionAsOpen(body);                
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
            case TokenPairPositionTrackerDOFetchMethod.editTriggerPercentOnOpenPosition:
                return await this.handleEditTriggerPercentOnOpenPosition(body);
            case TokenPairPositionTrackerDOFetchMethod.setSellAutoDoubleOnOpenPosition:
                return await this.handleSetSellAutoDoubleOnOpenPosition(body);
            case TokenPairPositionTrackerDOFetchMethod.adminInvokeAlarm:
                await this.alarm();
                return makeJSONResponse<{}>({});
            case TokenPairPositionTrackerDOFetchMethod.adminDeleteAllInTracker:
                return await this.handleAdminDeleteAllInTracker(body);
            case TokenPairPositionTrackerDOFetchMethod.positionExists:
                return await this.handlePositionExistsInTracker(body);
            case TokenPairPositionTrackerDOFetchMethod.markBuyAsConfirmed:
                return await this.handleMarkBuyAsConfirmed(body);
            case TokenPairPositionTrackerDOFetchMethod.setSellSlippagePercentOnOpenPosition:
                return await this.handleSetSellSlippagePercentOnOpenPosition(body);
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
            case TokenPairPositionTrackerDOFetchMethod.deactivatePosition:
                return await this.handleDeactivatePosition(body);
            case TokenPairPositionTrackerDOFetchMethod.reactivatePosition:
                return await this.handleReactivatePosition(body);
            case TokenPairPositionTrackerDOFetchMethod.listDeactivatedPositions:
                return await this.handleListDeactivatedPositions(body);
            case TokenPairPositionTrackerDOFetchMethod.getDeactivatedPosition:
                return await this.handleGetDeactivatedPosition(body);
            case TokenPairPositionTrackerDOFetchMethod.incrementOtherSellFailureCount:
                return await this.handleIncrementOtherSellFailureCount(body);
            case TokenPairPositionTrackerDOFetchMethod.doubleSellSlippage:
                return await this.handleDoubleSellSlippageInTracker(body);
            default:
                assertNever(method);
        }
    }

    async handleDoubleSellSlippageInTracker(body: DoubleSellSlippageInTrackerRequest) : Promise<Response> {
        if (body.markAsOpen) {
            this.tokenPairPositionTracker.markPositionAsOpen(body.positionID);
        }
        this.tokenPairPositionTracker.doubleSellSlippage(body.positionID);
        return makeJSONResponse<DoubleSellSlippageInTrackerResponse>({});
    }

    async handleIncrementOtherSellFailureCount(body : IncrementOtherSellFailureCountInTrackerRequest) : Promise<Response> {
        const result = this.tokenPairPositionTracker.incrementOtherSellFailureCount(body.positionID);
        return makeJSONResponse<IncrementOtherSellFailureCountInTrackerResponse>(result)
    }

    async handleGetDeactivatedPosition(body: GetDeactivatedPositionFromTrackerRequest) : Promise<Response> {
        const deactivatedPosition = this.tokenPairPositionTracker.getDeactivatedPosition(body.telegramUserID, body.positionID);
        return makeJSONResponse<GetDeactivatedPositionFromTrackerResponse>({ deactivatedPosition });
    }

    async handleDeactivatePosition(body: DeactivatePositionInTrackerRequest) : Promise<Response> {
        // If the position is an auto-sell that's failing, mark as open first.
        if (body.markOpenBeforeDeactivating) {
            this.tokenPairPositionTracker.markPositionAsOpen(body.positionID);
        }
        const success = this.tokenPairPositionTracker.deactivatePosition(body.positionID);
        return makeJSONResponse<DeactivatePositionInTrackerResponse>({ success });
    }

    async handleReactivatePosition(body: ReactivatePositionInTrackerRequest): Promise<Response> {
        const currentPrice = await this.getPrice();
        if (currentPrice == null) {
            return makeJSONResponse<ReactivatePositionInTrackerResponse>({ success: false })
        }
        const success = this.tokenPairPositionTracker.reactivatePosition(body.userID, body.positionID, currentPrice);
        return makeJSONResponse<ReactivatePositionInTrackerResponse>({ success });
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

    async handleSetSellSlippagePercentOnOpenPosition(body : SetSellSlippagePercentOnOpenPositionTrackerRequest) : Promise<Response> {
        const response = await this.handleSetSellSlippagePercentOnOpenPositionInternal(body);
        return makeJSONResponse<SellSellSlippagePercentageOnOpenPositionResponse>(response);
    }

    async handleSetSellSlippagePercentOnOpenPositionInternal(body : SetSellSlippagePercentOnOpenPositionTrackerRequest) : Promise<SellSellSlippagePercentageOnOpenPositionResponse> {
        const positionID = body.positionID;
        const currentPrice = await this.getPrice();
        const positionAndMaybePNL = this.tokenPairPositionTracker.getPositionAndMaybePNL(positionID,currentPrice);
        if (positionAndMaybePNL != null && positionAndMaybePNL.position.status === PositionStatus.Open) {
            positionAndMaybePNL.position.sellSlippagePercent = body.sellSlippagePercent;
        }
        return { positionAndMaybePNL: positionAndMaybePNL||null };
    }

    async handleMarkBuyAsConfirmed(body: MarkBuyAsConfirmedRequest) : Promise<Response> {
        const pos = this.tokenPairPositionTracker.getPosition(body.positionID);
        if (pos != null) {
            pos.buyConfirmed = true;
        }
        const responseBody : MarkBuyAsConfirmedResponse = {};
        return makeJSONResponse<MarkBuyAsConfirmedResponse>(responseBody);
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

    async handleSetSellAutoDoubleOnOpenPosition(body : SetSellAutoDoubleOnOpenPositionInTrackerRequest) : Promise<Response> {
        const response = this.handleSetSellAutoDoubleOnOpenPositionInternal(body);
        return makeJSONResponse<SetSellAutoDoubleOnOpenPositionResponse>(response);
    }

    private async handleSetSellAutoDoubleOnOpenPositionInternal(body : SetSellAutoDoubleOnOpenPositionInTrackerRequest) : Promise<SetSellAutoDoubleOnOpenPositionResponse> {
        const positionID = body.positionID;
        const position = this.tokenPairPositionTracker.getPosition(positionID);
        if (position == null) {
            return {};
        }
        if (position.status !== PositionStatus.Open) {
            return {}; // TODO: status
        }
        position.sellAutoDoubleSlippage = body.choice;
        return {};
    }

    async handleEditTriggerPercentOnOpenPosition(body : EditTriggerPercentOnOpenPositionInTrackerRequest) : Promise<Response> {
        const response = await this.handleEditTriggerPercentOnOpenPositionInternal(body);
        return makeJSONResponse<EditTriggerPercentOnOpenPositionResponse>(response);
    }

    private async handleEditTriggerPercentOnOpenPositionInternal(body: EditTriggerPercentOnOpenPositionInTrackerRequest) : Promise<EditTriggerPercentOnOpenPositionResponse> {
        const positionID = body.positionID;
        const percent = body.percent;
        if (percent <= 0 || percent >= 100) {
            return 'invalid-percent';
        }
        if (!this.initialized()) {
            throw new Error("Not initialized");
        }
        const currentPrice = await this.getPrice();
        const positionAndMaybePNL = this.tokenPairPositionTracker.getPositionAndMaybePNL(positionID, currentPrice);
        if (positionAndMaybePNL == null) {
            return 'position-DNE';
        }
        else if (positionAndMaybePNL.position.status === PositionStatus.Closing) {
            return 'is-closing';
        }
        else if (positionAndMaybePNL.position.status === PositionStatus.Closed) {
            return 'is-closed';
        }
        else if (positionAndMaybePNL.position.status === PositionStatus.Open) {
            positionAndMaybePNL.position.triggerPercent = percent;
            return positionAndMaybePNL;
        }
        else {
            assertNever(positionAndMaybePNL.position.status);
        }
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
        if (!this.initialized()) {
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
        if (!this.initialized()) {
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
         // deliberate lack of await, but still writes to storage when complete.
        this.performWakupActions().finally(async () => {
            logDebug(`Finished wakeup. ${this.tokenAddress.value}`);
            await this.flushToStorage();
        });
        return makeJSONResponse(responseBody);
    }

    async performWakupActions() {

        const startTimeMS = Date.now();
        const connection = new Connection(getRPCUrl(this.env));

        const unconfirmedBuys : { type: 'buy', pos : Position & { buyConfirmed: false } }[] = this.tokenPairPositionTracker.getUnconfirmedBuys().map(x => { return { type : 'buy', pos: x }; });
        const unconfirmedSells : { type : 'sell', pos: Position & { sellConfirmed : false } }[] = this.tokenPairPositionTracker.getUnconfirmedSells().map(x => { return { type : 'sell', pos : x }});
        const allThingsToDo = [...unconfirmedBuys, ...unconfirmedSells];
        allThingsToDo.sort(x => -toNumber(x.pos.vsTokenAmt));

        const buyConfirmer = new BuyConfirmer(connection, startTimeMS, this.env);
        const sellConfirmer = new SellConfirmer(connection, startTimeMS, this.env);

        // TODO: put this case-by-case logic into the confirmer or a separate handler class

        for (const { type, pos } of allThingsToDo) {
            if (type === 'buy') {
                if (buyConfirmer.isTimedOut()) {
                    continue;
                }
                // hack to prevent confirm attempts from firing off during buy. TODO: less hacky way to do this.
                const tooLittleTimeHasPassedSinceBuyAttempt = pos.txBuyAttemptTimeMS != null && pos.txBuyAttemptTimeMS > (Date.now() - strictParseInt(this.env.TX_TIMEOUT_MS));
                if (tooLittleTimeHasPassedSinceBuyAttempt) {
                    continue;
                }                
                const buyConfirmPrefix = `:notify: <b>Attempting to confirm your earlier purchase of ${asTokenPrice(pos.tokenAmt)} ${pos.token.symbol}</b>: `;
                const channel = TGStatusMessage.createAndSend('In progress...', false, pos.chatID, this.env, 'HTML', buyConfirmPrefix);
                const confirmedBuy = await buyConfirmer.confirmBuy(pos);
                if (confirmedBuy === 'api-error') {
                    TGStatusMessage.queue(channel, "We had a hard time confirming the purchase - sorry, we will retry confirmation again soon.", true);
                    break;
                }
                else if (confirmedBuy === 'unconfirmed') {
                    TGStatusMessage.queue(channel, "We had a hard time confirming the purchase because of network congestion or the transaction happened too recently - sorry, we will retry confirmation again soon.", true);
                    continue;
                }
                else if (confirmedBuy === 'failed') {
                    TGStatusMessage.queue(channel, "After checking, we found that the purchase didn't go through.", true);
                    this.tokenPairPositionTracker.removePosition(pos.positionID);
                }
                else if (confirmedBuy === 'frozen-token-account') {
                    TGStatusMessage.queue(channel, `After checking, we found that the purchase didn't go through because $${pos.token.symbol} has been frozen due to suspicious activity.`, true);
                    this.tokenPairPositionTracker.removePosition(pos.positionID);
                }
                else if (confirmedBuy === 'insufficient-sol') {
                    TGStatusMessage.queue(channel, `After checking, we found that the purchase didn't go through because there wasn't enough SOL in your account to cover the purchase`, true);
                    this.tokenPairPositionTracker.removePosition(pos.positionID);
                }
                else if (confirmedBuy === 'slippage-failed') {
                    TGStatusMessage.queue(channel, `After checking, we found that the purchase didn't go through because the slippage tolerance was exceeded`, true);
                    this.tokenPairPositionTracker.removePosition(pos.positionID);
                }
                else if (confirmedBuy === 'token-fee-account-not-initialized') {
                    TGStatusMessage.queue(channel, `After checking, we found that the purchase didn't complete.`, true);
                    this.tokenPairPositionTracker.removePosition(pos.positionID);
                }
                else if (confirmedBuy === 'insufficient-tokens-balance') {
                    // This shouldn't happen because we can't have too few of the tokens we are currently buying
                    // But I include this case to make TS happy
                    TGStatusMessage.queue(channel, `After checking, we found that there were not enough tokens to cover the purchase.`, true);
                    this.tokenPairPositionTracker.removePosition(pos.positionID);
                }
                else if ('positionID' in confirmedBuy) {
                    // TODO: specific method just to handle changes made by confirmer.
                    TGStatusMessage.queue(channel, "We were able to confirm this purchase! It will be listed in your open positions.", true);
                    this.tokenPairPositionTracker.updatePosition(confirmedBuy);
                }
                else {
                    assertNever(confirmedBuy);
                }
                TGStatusMessage.finalize(channel);
            }
            else if (type === 'sell') {
                // TODO: on confirm, too many errors
                if (sellConfirmer.isTimedOut()) {
                    continue;
                }
                // hack to prevent confirm attempts from firing off during sale. TODO: less hacky way to do this.
                const tooLittleTimeHasPassedSinceSellAttempt = pos.txSellAttemptTimeMS != null && pos.txSellAttemptTimeMS > (Date.now() - strictParseInt(this.env.TX_TIMEOUT_MS));
                if (tooLittleTimeHasPassedSinceSellAttempt) {
                    continue;
                }
                const sellConfirmPrefix = `:notify: <b>Attempting to confirm the earlier sale of ${asTokenPrice(pos.tokenAmt)} $${pos.token.symbol}</b>: `;
                const channel = TGStatusMessage.createAndSend('In progress...', false, pos.chatID, this.env, 'HTML', sellConfirmPrefix);
                const confirmedSellStatus = await sellConfirmer.confirmSell(pos);
                if (confirmedSellStatus === 'api-error') {
                    await TGStatusMessage.finalMessage(channel, "Confirmation not complete - we will continue soon.", true);
                    // no action on position in tracker because could not complete confirmation
                    break;
                }
                else if (confirmedSellStatus === 'unconfirmed') {
                    await TGStatusMessage.finalMessage(channel, "Confirmation not complete - we will continue soon.", true);
                    // no action on position in tracker because could not confirm outcome
                    continue;
                }
                else if (confirmedSellStatus === 'tx-was-dropped') {
                    await TGStatusMessage.finalMessage(channel, "We found that the sale didn't go through.", true);
                    this.tokenPairPositionTracker.markPositionAsOpen(pos.positionID);                
                }
                else if (confirmedSellStatus === 'other-failed') {
                    const max_other_sell_failures = strictParseInt(this.env.OTHER_SELL_FAILURES_TO_DEACTIVATE);
                    if ((pos.otherSellFailureCount)||0+1 >= max_other_sell_failures) {
                        this.tokenPairPositionTracker.markPositionAsOpen(pos.positionID);
                        this.tokenPairPositionTracker.deactivatePosition(pos.positionID);
                        await TGStatusMessage.finalMessage(channel, `Sale of this position failed for an unknown reason ${max_other_sell_failures} or more times, so this position will be deactivated.`, MenuCode.ViewDeactivatedPositions);                        
                    }
                    else {
                        this.tokenPairPositionTracker.incrementOtherSellFailureCount(pos.positionID);
                        this.tokenPairPositionTracker.markPositionAsOpen(pos.positionID);
                        await TGStatusMessage.finalMessage(channel, "We found that the sale didn't go through.", true);
                    }
                }
                else if (confirmedSellStatus === 'slippage-failed') {
                    if (pos.sellAutoDoubleSlippage && strictParseBoolean(this.env.ALLOW_CHOOSE_AUTO_DOUBLE_SLIPPAGE)) {
                        const maxSlippage = 100;
                        const sellSlippagePercent = Math.min(maxSlippage, 2 * pos.sellSlippagePercent);
                        await TGStatusMessage.finalMessage(channel, "The sale failed due to slippage.  We have increased the slippage to ${sellSlippagePercent}% and will retry the sale if the trigger conditions holds.", true);
                        this.tokenPairPositionTracker.updateSlippage(pos.positionID,sellSlippagePercent);
                        this.tokenPairPositionTracker.markPositionAsOpen(pos.positionID);
                    }
                    else {
                        await TGStatusMessage.finalMessage(channel, `The sale failed due to slippage. We will re-sell if the price continues to stay ${pos.triggerPercent.toFixed(1)}% below the peak.`, true);
                        this.tokenPairPositionTracker.markPositionAsOpen(pos.positionID);
                    }
                }
                else if (confirmedSellStatus === 'frozen-token-account') {
                    await TGStatusMessage.finalMessage(channel, "The sale didn't go through because this token has been frozen (most likely it was rugged).  The position has been deactivated.", true);
                    this.tokenPairPositionTracker.markPositionAsOpen(pos.positionID);
                    this.tokenPairPositionTracker.deactivatePosition(pos.positionID);
                }
                else if (confirmedSellStatus === 'insufficient-sol') {
                    await TGStatusMessage.finalMessage(channel, "We found that the sale didn't go through because there wasn't enough SOL in your wallet to cover transaction fees. The position has been deactivated.", true);
                    this.tokenPairPositionTracker.markPositionAsOpen(pos.positionID);
                    this.tokenPairPositionTracker.deactivatePosition(pos.positionID);
                }
                else if (confirmedSellStatus === 'token-fee-account-not-initialized') {
                    this.tokenPairPositionTracker.markPositionAsOpen(pos.positionID);
                    this.tokenPairPositionTracker.deactivatePosition(pos.positionID);
                    await TGStatusMessage.finalMessage(channel, "We found that the sale didn't go through because of an error on our platform. The position has been deactivated.", true);
                }
                else if (confirmedSellStatus === 'insufficient-tokens-balance') {
                    this.tokenPairPositionTracker.markPositionAsOpen(pos.positionID);
                    this.tokenPairPositionTracker.deactivatePosition(pos.positionID);
                    await TGStatusMessage.finalMessage(channel, "We found that the sale didn't go through because there were not enough tokens in your wallet to cover the sale. The position has been deactivated.", true);
                }
                else if (isSuccessfullyParsedSwapSummary(confirmedSellStatus)) {
                    // TODO: update with PNL               
                    const netPNL = dSub(confirmedSellStatus.swapSummary.outTokenAmt, pos.vsTokenAmt);
                    this.tokenPairPositionTracker.closePosition(pos.positionID, netPNL);
                    await TGStatusMessage.finalMessage(channel, `The sale was confirmed! You made ${asTokenPriceDelta(netPNL)} SOL.`, MenuCode.ViewPNLHistory); 
                }
                else {
                    assertNever(confirmedSellStatus);
                }
            }
            else {
                assertNever(type);
            }
        }
    }

    async handleMarkPositionAsClosed(body: MarkPositionAsClosedRequest) : Promise<Response> {
        this.ensureIsInitialized(body);
        this.tokenPairPositionTracker.closePosition(body.positionID, body.netPNL);
        const responseBody : MarkPositionAsClosedResponse = {};
        return makeJSONResponse(responseBody);
    }

    async handleMarkPositionAsClosing(body : MarkPositionAsClosingRequest): Promise<Response> {
        this.ensureIsInitialized(body);
        this.tokenPairPositionTracker.markPositionAsClosing(body.positionID);
        const responseBody : MarkPositionAsClosingResponse = {};
        return makeJSONResponse(responseBody);
    }

    async handleMarkPositionAsOpen(body: MarkPositionAsOpenRequest) : Promise<Response> {
        this.ensureIsInitialized(body);
        this.tokenPairPositionTracker.markPositionAsOpen(body.positionID);
        const responseBody : MarkPositionAsOpenResponse = {};
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
        if (!this.initialized()) {
            throw new Error("Must initialized before using");
        }
    }

    async performTriggeredPriceUpdateActions(request : UpdatePriceRequest) : Promise<Response> {

        this.ensureIsInitialized(request);
        
        const newPrice = request.price;
        
        this.tokenPairPositionTracker.updatePrice(newPrice);

        const positionsToClose = this.tokenPairPositionTracker.collectPositionsToClose(newPrice);
        
        // biggest SOL purchase first (highest priority)
        positionsToClose.sort(p => -toNumber(p.vsTokenAmt));
        if (positionsToClose.length > 0) {
            sendClosePositionOrdersToUserDOs(positionsToClose, this.env);
        }

        const responseBody : UpdatePriceResponse = {};
        return makeJSONResponse(responseBody);
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