import { DurableObjectState } from "@cloudflare/workers-types";
import { makeJSONResponse } from "../../util/http_helpers";
import { TokenPairPositionTrackerDOFetchMethod, parseTokenPairPositionTrackerDOFetchMethod } from "./token_pair_position_tracker_DO_interop";
import { TokenPairPositionTracker } from "./trackers/token_pair_position_tracker";
import { Env } from "../../env";
import { TokenPairPositionTrackerInitializeRequest } from "./actions/initialize_token_pair_position_tracker";
import { ImportNewPositionsRequest, ImportNewPositionsResponse } from "./actions/import_new_positions";
import { UpdatePriceRequest, UpdatePriceResponse  } from "./actions/update_price";
import { DecimalizedAmount, MATH_DECIMAL_PLACES, fromNumber } from "../../decimalized/decimalized_amount";
import { UserDOFetchMethod, sendClosePositionOrdersToUserDOs } from "../user/userDO_interop";
import { AutomaticallyClosePositionRequest, AutomaticallyClosePositionsRequest } from "./actions/automatically_close_positions";
import { MarkPositionAsClosedRequest, MarkPositionAsClosedResponse } from "./actions/mark_position_as_closed";
import { MarkPositionAsClosingRequest, MarkPositionAsClosingResponse } from "./actions/mark_position_as_closing";
import { ChangeTrackedValue } from "../../util/change_tracked_value";

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
    state :   DurableObjectState

    // initialized properties - token and the 'swap-from' vsToken (i.e; USDC)
    tokenAddress :   ChangeTrackedValue<string|null> = new ChangeTrackedValue<string|null>("tokenAddress",null);
    vsTokenAddress : ChangeTrackedValue<string|null> = new ChangeTrackedValue<string|null>("vsTokenAddress",null);
    isPolling : boolean // deliberately not change tracked.
    
    // this performs all the book keeping and determines what RPC actions to take
    tokenPairPositionTracker : TokenPairPositionTracker = new TokenPairPositionTracker();
    
    env : Env

    constructor(state : DurableObjectState, env : Env) {

        this.state       = state; // access to persistent storage (as opposed to in-memory)
        this.isPolling          = false;
        this.env = env;
        this.state.blockConcurrencyWhile(async () => {
            await this.initializeFromStorage(this.state.storage);
        });
    }

    async initializeFromStorage(storage : DurableObjectStorage) {
        const entries = await storage.list();
        this.tokenAddress.initialize(entries);
        this.vsTokenAddress.initialize(entries);
        this.tokenPairPositionTracker.initialize(entries);
    }

    async flushToStorage() {
        await Promise.allSettled([
            this.tokenAddress.flushToStorage(this.state.storage),
            this.vsTokenAddress.flushToStorage(this.state.storage),
            this.tokenPairPositionTracker.flushToStorage(this.state.storage)
        ]);
    }

    shouldBePolling() : boolean {
        return this.tokenPairPositionTracker.any() && this.initialized();
    }

    initialized() : boolean {
        return this.vsTokenAddress.value != null && this.tokenAddress.value != null;
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
            const price = await this.getPrice();
            if (price != null) {
                this.handleUpdatePrice({ price });
            }
        }
        catch(e) {
            console.log("Price polling failed.");
        }
        if (!this.shouldBePolling()) {
            this.isPolling = false;
            return;
        }
        else {
            await this.scheduleNextPoll(beginExecutionTime);
        }
    }

    async getPrice() : Promise<DecimalizedAmount|undefined> {
        const tokenAddress = this.tokenAddress.value!!;
        const vsTokenAddress = this.vsTokenAddress;
        const url = `https://price.jup.ag/v4/price?ids=${tokenAddress}&vsToken=${vsTokenAddress}`
        const response = await fetch(url);
        if (!response.ok) {
            return;
        }
        const responseBody : any = (await response.json());
        const price = responseBody.data[tokenAddress];
        const decimalizedPrice = fromNumber(price, MATH_DECIMAL_PLACES);
        return decimalizedPrice;
    }

    async scheduleNextPoll(begin : number) {
        this.isPolling = true;
        const end = Date.now();
        const elapsed = end - begin;
        if (elapsed > 1000) {
            console.log("Tracker ran longer than 1s");
        }
        const remainder = elapsed % 1000;
        const nextAlarm = 1000 - remainder;
        const alarmTime = Date.now() + nextAlarm;
        await this.state.storage.setAlarm(alarmTime);
    }

    async fetch(request : Request) : Promise<Response> {

        const [method,body] = await this.validateFetchRequest(request);
        const response = await this._fetch(method,body);
        if (this.shouldBePolling() && !this.isPolling) {
            this.scheduleNextPoll(Date.now());
        }
        await this.flushToStorage();
        return response;
    }

    async _fetch(method : TokenPairPositionTrackerDOFetchMethod, body : any) : Promise<Response> {
        switch(method) {
            case TokenPairPositionTrackerDOFetchMethod.initialize:
                return await this.handleInitialize(body);
            case TokenPairPositionTrackerDOFetchMethod.updatePrice:
                this.assertIsInitialized();
                return await this.handleUpdatePrice(body);
            case TokenPairPositionTrackerDOFetchMethod.importNewOpenPositions:
                this.assertIsInitialized();
                return await this.handleImportNewOpenPositions(body);
            case TokenPairPositionTrackerDOFetchMethod.markPositionAsClosing:
                this.assertIsInitialized();
                return await this.handleMarkPositionAsClosing(body);
            case TokenPairPositionTrackerDOFetchMethod.markPositionAsClosed:
                this.assertIsInitialized();
                return await this.handleMarkPositionAsClosed(body);
            default:
                return makeJSONResponse({},400);
        }
    }

    async handleImportNewOpenPositions(body : ImportNewPositionsRequest) {
        const responseBody : ImportNewPositionsResponse = {};
        this.tokenPairPositionTracker.importNewOpenPositions(body.positions);
        return makeJSONResponse(responseBody);
    }

    async handleMarkPositionAsClosed(body: MarkPositionAsClosedRequest) : Promise<Response> {
        this.tokenPairPositionTracker.closePosition(body.positionID);
        const responseBody : MarkPositionAsClosedResponse = {};
        return makeJSONResponse(responseBody)
    }

    async handleMarkPositionAsClosing(body : MarkPositionAsClosingRequest): Promise<Response> {
        this.tokenPairPositionTracker.markPositionAsClosing(body.positionID);
        const responseBody : MarkPositionAsClosingResponse = {};
        return makeJSONResponse(responseBody);
    }

    async validateFetchRequest(request : Request) : Promise<[TokenPairPositionTrackerDOFetchMethod,any]> {
        const jsonBody : any = await request.json();
        const methodName = new URL(request.url).pathname.substring(1);
        const method : TokenPairPositionTrackerDOFetchMethod|null = parseTokenPairPositionTrackerDOFetchMethod(methodName);
        if (method == null) {
            throw new Error(`Unknown method ${method}`);
        }
        return [method,jsonBody];
    }

    assertIsInitialized() {
        if (!this.initialized()) {
            throw new Error("Must initialized before using");
        }
    }

    async handleInitialize(initializeRequest : TokenPairPositionTrackerInitializeRequest) : Promise<Response> {
        if (!this.initialized()) {
            this.tokenAddress.value = initializeRequest.token.address;
            this.vsTokenAddress.value = initializeRequest.vsToken.address;
        }
        return new Response(null, { status: 200 });
    }

    async handleUpdatePrice(request : UpdatePriceRequest) : Promise<Response> {
        const newPrice = request.price;
        this.updatePrice(newPrice);
        const responseBody : UpdatePriceResponse = {};
        return makeJSONResponse(responseBody);
    }

    async updatePrice(newPrice : DecimalizedAmount) {
        // fire and forget so we don't block subsequent update-price ticks
        const positionsToClose = this.tokenPairPositionTracker.updatePrice(newPrice);
        const request : AutomaticallyClosePositionsRequest = { positions: positionsToClose.positionsToClose }
        sendClosePositionOrdersToUserDOs(request, this.env);
    }
}