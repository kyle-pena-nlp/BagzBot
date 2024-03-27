import { DurableObjectState } from "@cloudflare/workers-types";
import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import { logDebug, logError, logInfo } from "../../logging";
import { ChangeTrackedValue, assertNever, makeJSONResponse, makeSuccessResponse, strictParseBoolean } from "../../util";
import { sendClosePositionOrdersToUserDOs } from "../user/userDO_interop";
import { AutomaticallyClosePositionsRequest } from "./actions/automatically_close_positions";
import { GetPositionFromPriceTrackerRequest, GetPositionFromPriceTrackerResponse } from "./actions/get_position";
import { GetTokenPriceRequest, GetTokenPriceResponse } from "./actions/get_token_price";
import { HasPairAddresses } from "./actions/has_pair_addresses";
import { ListPositionsByUserRequest, ListPositionsByUserResponse } from "./actions/list_positions_by_user";
import { MarkPositionAsClosedRequest, MarkPositionAsClosedResponse } from "./actions/mark_position_as_closed";
import { MarkPositionAsClosingRequest, MarkPositionAsClosingResponse } from "./actions/mark_position_as_closing";
import { MarkPositionAsOpenRequest, MarkPositionAsOpenResponse } from "./actions/mark_position_as_open";
import { RemovePositionRequest, RemovePositionResponse } from "./actions/remove_position";
import { UpdatePriceRequest, UpdatePriceResponse } from "./actions/update_price";
import { UpsertPositionsRequest, UpsertPositionsResponse } from "./actions/upsert_positions";
import { WakeupRequest, WakeupResponse } from "./actions/wake_up";
import { TokenPairPositionTrackerDOFetchMethod, parseTokenPairPositionTrackerDOFetchMethod } from "./token_pair_position_tracker_DO_interop";
import { CurrentPriceTracker } from "./trackers/current_price_tracker";
import { TokenPairPositionTracker } from "./trackers/token_pair_position_tracker";
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
    isPolling : boolean; // deliberately not change tracked.
    
    // this performs all the book keeping and determines what RPC actions to take
    tokenPairPositionTracker : TokenPairPositionTracker = new TokenPairPositionTracker();
    
    // this contains (and queries for) the current price of the pair in $token/$vsToken
    currentPriceTracker : CurrentPriceTracker = new CurrentPriceTracker();

    env : Env;

    constructor(state : DurableObjectState, env : Env) {

        this.state       = state; // access to persistent storage (as opposed to in-memory)
        this.isPolling   = false;
        this.env         = env;
        this.state.blockConcurrencyWhile(async () => {
            await this.loadStateFromStorage(this.state.storage);
        });
    }

    async loadStateFromStorage(storage : DurableObjectStorage) {
        const entries = await storage.list();
        this.tokenAddress.initialize(entries);
        this.vsTokenAddress.initialize(entries);
        this.tokenPairPositionTracker.initialize(entries);
        this.currentPriceTracker.initialize(entries);
    }

    async flushToStorage() {
        await Promise.allSettled([
            this.tokenAddress.flushToStorage(this.state.storage),
            this.vsTokenAddress.flushToStorage(this.state.storage),
            this.tokenPairPositionTracker.flushToStorage(this.state.storage),
            this.currentPriceTracker.flushToStorage(this.state.storage)
        ]);
    }

    shouldBePolling() : boolean {
        return this.tokenPairPositionTracker.any() && this.initialized() && strictParseBoolean(this.env.POLLING_ON);
    }

    initialized() : boolean {
        return  this.vsTokenAddress.value != null && 
                this.tokenAddress.value != null;
    }

    async alarm() {
        try {
            await this._alarm();
        }
        catch(e : any) {
            console.error(e.toString());
        }
        finally {
            await this.flushToStorage();
        }
    }

    async _alarm() {
        const beginExecutionTime = Date.now();
        await this.state.storage.deleteAlarm();
        try {
            const price = await this.currentPriceTracker.getPrice();
            if (price != null) {
                this.updatePositionTracker(price);
            }
            else {
                logError("Could not retrieve price", this);
            }
        }
        catch(e) {
            logError("Price polling failed.", e, this.tokenAddress, this.vsTokenAddress);
        }
        if (!this.shouldBePolling()) {
            this.isPolling = false;
            return;
        }
        else {
            await this.scheduleNextPoll(beginExecutionTime);
        }
    }

    async scheduleNextPoll(begin : number) {
        this.isPolling = true;
        const end = Date.now();
        const elapsed = end - begin;
        if (elapsed > 1000) {
            logInfo("Tracker ran longer than 1s", this.tokenAddress, this.vsTokenAddress);
        }
        const remainder = elapsed % 1000;
        const nextAlarm = 1000 - remainder;
        const alarmTime = Date.now() + nextAlarm;
        await this.state.storage.setAlarm(alarmTime);
    }

    async fetch(request : Request) : Promise<Response> {
        const [method,body] = await this.validateFetchRequest(request);
        try {
            const response = await this._fetch(method,body);
            if (this.shouldBePolling() && !this.isPolling) {
                this.scheduleNextPoll(Date.now());
            }
            return response;
        }
        catch(e : any) {
            logError("Error in fetch for tokenPairPositionTracker", e, this.tokenAddress, this.vsTokenAddress);
        }
        finally {
            await this.flushToStorage();
        }
        return makeSuccessResponse();
    }

    async _fetch(method : TokenPairPositionTrackerDOFetchMethod, body : any) : Promise<Response> {
        switch(method) {
            case TokenPairPositionTrackerDOFetchMethod.updatePrice:
                return await this.handleUpdatePrice(body);
            case TokenPairPositionTrackerDOFetchMethod.upsertPositions:
                return await this.handleUpsertPositions(body);
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
            case TokenPairPositionTrackerDOFetchMethod.getPosition:
                return await this.handleGetPosition(body);
            default:
                assertNever(method);
        }
    }

    async handleGetPosition(body : GetPositionFromPriceTrackerRequest) : Promise<Response> {
        const positionID = body.positionID;
        const maybePosition = this.tokenPairPositionTracker.getPosition(positionID);
        const response : GetPositionFromPriceTrackerResponse = { maybePosition : maybePosition };
        return makeJSONResponse(response);
    }

    async handleRemovePosition(body: RemovePositionRequest) : Promise<Response> {
        const positionID = body.positionID;
        this.tokenPairPositionTracker.removePosition(positionID);
        const response : RemovePositionResponse = {};
        return makeJSONResponse(response);
    }

    async handleListPositionsByUser(body: ListPositionsByUserRequest) : Promise<Response> {
        const userID = body.telegramUserID;
        const positions = this.tokenPairPositionTracker.listByUser(userID);
        const response : ListPositionsByUserResponse = {
            positions: positions
        }
        return makeJSONResponse<ListPositionsByUserResponse>(response);
    }

    async handleGetTokenPrice(body : GetTokenPriceRequest) : Promise<Response> {
        const price = await this.currentPriceTracker.getPrice();
        return makeJSONResponse<GetTokenPriceResponse>({ price : price });
    }

    async handleWakeup(body : WakeupRequest) {
        // this is a no-op, because by simply calling a request we wake up the DO
        const responseBody : WakeupResponse = {};
        return makeJSONResponse(responseBody);
    }

    async handleUpsertPositions(body : UpsertPositionsRequest) {
        this.ensureIsInitialized(body);
        const responseBody : UpsertPositionsResponse = {};
        this.tokenPairPositionTracker.upsertPositions(body.positions);
        return makeJSONResponse(responseBody);
    }

    async handleMarkPositionAsClosed(body: MarkPositionAsClosedRequest) : Promise<Response> {
        this.ensureIsInitialized(body);
        this.tokenPairPositionTracker.closePosition(body.positionID);
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
        logDebug(`token pair position tracker - executing ${method}`);
        return [method,jsonBody];
    }

    assertIsInitialized() {
        if (!this.initialized()) {
            throw new Error("Must initialized before using");
        }
    }

    async handleUpdatePrice(request : UpdatePriceRequest) : Promise<Response> {
        this.ensureIsInitialized(request);
        const newPrice = request.price;
        const actionsToTake = this.updatePositionTracker(newPrice);
        const closePositionsRequest : AutomaticallyClosePositionsRequest = { positions: actionsToTake.positionsToClose };
        sendClosePositionOrdersToUserDOs(closePositionsRequest, this.env);
        const responseBody : UpdatePriceResponse = {};
        return makeJSONResponse(responseBody);
    }

    updatePositionTracker(newPrice : DecimalizedAmount) {
        // fire and forget so we don't block subsequent update-price ticks
        const positionsToClose = this.tokenPairPositionTracker.updatePrice(newPrice);
        return positionsToClose;
    }
    
    ensureIsInitialized(x : HasPairAddresses) {
        this.tokenAddress.value = x.tokenAddress;
        this.vsTokenAddress.value = x.vsTokenAddress;
    }
}