import { DurableObjectState } from "@cloudflare/workers-types";
import { DecimalizedAmount } from "../../decimalized";
import { toNumber } from "../../decimalized/decimalized_amount";
import { Env } from "../../env";
import { logDebug, logError, logInfo } from "../../logging";
import { ChangeTrackedValue, assertNever, makeJSONResponse, makeSuccessResponse, strictParseBoolean, strictParseInt } from "../../util";
import { ensureTokenPairIsRegistered } from "../heartbeat/heartbeat_do_interop";
import { sendClosePositionOrdersToUserDOs } from "../user/userDO_interop";
import { GetPositionFromPriceTrackerRequest, GetPositionFromPriceTrackerResponse } from "./actions/get_position";
import { GetTokenPriceRequest, GetTokenPriceResponse } from "./actions/get_token_price";
import { HasPairAddresses } from "./actions/has_pair_addresses";
import { HeartbeatWakeupRequestForTokenPairPositionTracker, isHeartbeatRequest } from "./actions/heartbeat_wake_up_for_token_pair_position_tracker";
import { ListPositionsByUserRequest, ListPositionsByUserResponse } from "./actions/list_positions_by_user";
import { MarkPositionAsClosedRequest, MarkPositionAsClosedResponse } from "./actions/mark_position_as_closed";
import { MarkPositionAsClosingRequest, MarkPositionAsClosingResponse } from "./actions/mark_position_as_closing";
import { MarkPositionAsOpenRequest, MarkPositionAsOpenResponse } from "./actions/mark_position_as_open";
import { RemovePositionRequest, RemovePositionResponse } from "./actions/remove_position";
import { UpdatePriceRequest, UpdatePriceResponse } from "./actions/update_price";
import { UpsertPositionsRequest, UpsertPositionsResponse } from "./actions/upsert_positions";
import { WakeupTokenPairPositionTrackerRequest, WakeupTokenPairPositionTrackerResponse } from "./actions/wake_up";
import { TokenPairPositionTrackerDOFetchMethod, parseTokenPairPositionTrackerDOFetchMethod } from "./token_pair_position_tracker_do_interop";
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
    
    
    // this performs all the book keeping and determines what RPC actions to take
    tokenPairPositionTracker : TokenPairPositionTracker = new TokenPairPositionTracker();
    
    // this contains (and queries for) the current price of the pair in $token/$vsToken
    currentPriceTracker : CurrentPriceTracker = new CurrentPriceTracker();

    // when the DO loads up, it registers itself with HeartbeatDO
    // (which later sends heartbeat requests to keep the DO awake)
    needsToEnsureIsRegistered : boolean = true // deliberately not change tracker
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
        const entries = await storage.list();
        this.tokenAddress.initialize(entries);
        this.vsTokenAddress.initialize(entries);
        this.tokenPairPositionTracker.initialize(entries);
        this.currentPriceTracker.initialize(entries);

        // these should be in-sync but just in case.
        if (this.tokenPairPositionTracker.pricePeaks.currentPrice.value == null) {
            this.tokenPairPositionTracker.pricePeaks.currentPrice.value = this.currentPriceTracker.currentPrice.value;
        }
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
        if (!strictParseBoolean(this.env.POLLING_ON)) {
            logDebug(`${this.tokenPairID()} Price polling is turned off AND should not be price polling.`)
            return false;
        }
        if (!this.initialized()) {
            logDebug(`${this.tokenPairID()} not initialized AND should not be price polling.`)
            return false;
        }
        const anyPositionsToTrack = this.tokenPairPositionTracker.any();
        if (!anyPositionsToTrack) {
            logDebug(`${this.tokenPairID()} - No positions to track AND should not be price polling.`);
            return false;
        }
        return true;
    }

    initialized() : boolean {
        return  this.vsTokenAddress.value != null && 
                this.tokenAddress.value != null;
    }

    async alarm() {
        logDebug(`${this.tokenPairID()} - invoking alarm`);
        try {
            await this._alarm();
        }
        catch(e : any) {
            logError("alarm execution failed", this.tokenPairID(), e);
        }
        finally {
            await this.flushToStorage();
        }
    }

    async _alarm() {
        if (this.tokenAddress.value == null || this.vsTokenAddress.value == null) {
            throw new Error("Couldn't get token price because token pair addresses not initialized");
        }        
        const beginExecutionTime = Date.now();
        await this.state.storage.deleteAlarm();
        try {
            const price = await this.currentPriceTracker.getPrice(this.tokenAddress.value, this.vsTokenAddress.value);
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
            logDebug(`Turning off polling for ${this.tokenPairID()} - no longer needed`)
            this.isPolling = false;
            return;
        }
        else {
            await this.scheduleNextPoll(beginExecutionTime);
        }
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
        try {
            // ensure the token is registered with heartbeatDO
            if (!isHeartbeatRequest(body)) {
                this.tryToEnsureTokenPairIsRegistered();
            }
            const response = await this._fetch(method,body);
            this.ensureIsPollingPrice();
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
        if (this.needsToEnsureIsRegistered) {
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
            logDebug(`Registering token pair ${this.tokenPairID()}`);
            await ensureTokenPairIsRegistered(tokenAddress, vsTokenAddress, this.env).then(() => {
                this.needsToEnsureIsRegistered = false;
                logDebug(`Token pair ${tokenAddress}:${vsTokenAddress} is now registered with heartbeat!`);
            })
        }
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
            case TokenPairPositionTrackerDOFetchMethod.heartbeatWakeup:
                return await this.handleHeartbeatWakeup(body);
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
        if (this.tokenAddress.value == null || this.vsTokenAddress.value == null) {
            throw new Error("Couldn't get token price because token pair addresses not initialized");
        }
        const price = await this.currentPriceTracker.getPrice(this.tokenAddress.value, this.vsTokenAddress.value);
        return makeJSONResponse<GetTokenPriceResponse>({ price : price });
    }

    async handleWakeup(body : WakeupTokenPairPositionTrackerRequest) {
        // this is a no-op, because by simply calling a request we wake up the DO
        const responseBody : WakeupTokenPairPositionTrackerResponse = {};
        return makeJSONResponse(responseBody);
    }

    async handleHeartbeatWakeup(body : HeartbeatWakeupRequestForTokenPairPositionTracker) {
        // simply invoking any fetch method causes the DO to reschedule polling if needed
        return makeJSONResponse({});
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
        logDebug(`TokenPairPositionTrackerDO ${this.tokenPairID()} - executing ${method}`);
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
        actionsToTake.positionsToClose.sort(p => -toNumber(p.vsTokenAmt)); // biggest first, roughly speaking
        sendClosePositionOrdersToUserDOs(actionsToTake.positionsToClose, this.env);
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