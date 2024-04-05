import { Connection } from "@solana/web3.js";
import { isAdminOrSuperAdmin } from "../../admins";
import { DecimalizedAmount, dSub } from "../../decimalized";
import { asTokenPrice, toNumber } from "../../decimalized/decimalized_amount";
import { Env, getRPCUrl } from "../../env";
import { logDebug, logError, logInfo } from "../../logging";
import { Position, PositionStatus } from "../../positions";
import { isSuccessfullyParsedSwapSummary } from "../../rpc/rpc_types";
import { TGStatusMessage } from "../../telegram";
import { ChangeTrackedValue, assertNever, makeJSONResponse, makeSuccessResponse, strictParseBoolean, strictParseInt } from "../../util";
import { ensureTokenPairIsRegistered } from "../heartbeat/heartbeat_do_interop";
import { EditTriggerPercentOnOpenPositionResponse } from "../user/actions/edit_trigger_percent_on_open_position";
import { SetSellAutoDoubleOnOpenPositionResponse } from "../user/actions/set_sell_auto_double_on_open_position";
import { SellSellSlippagePercentageOnOpenPositionResponse } from "../user/actions/set_sell_slippage_percent_on_open_position";
import { sendClosePositionOrdersToUserDOs } from "../user/userDO_interop";
import { AdminDeleteAllInTrackerRequest, AdminDeleteAllInTrackerResponse } from "./actions/admin_delete_all_positions_in_tracker";
import { EditTriggerPercentOnOpenPositionInTrackerRequest } from "./actions/edit_trigger_percent_on_open_position_in_tracker";
import { GetPositionFromPriceTrackerRequest, GetPositionFromPriceTrackerResponse } from "./actions/get_position";
import { GetPositionAndMaybePNLFromPriceTrackerRequest, GetPositionAndMaybePNLFromPriceTrackerResponse } from "./actions/get_position_and_maybe_pnl";
import { GetTokenPriceRequest, GetTokenPriceResponse } from "./actions/get_token_price";
import { HasPairAddresses } from "./actions/has_pair_addresses";
import { isHeartbeatRequest } from "./actions/heartbeat_wake_up_for_token_pair_position_tracker";
import { ListClosedPositionsFromTrackerRequest, ListClosedPositionsFromTrackerResponse } from "./actions/list_closed_positions_from_tracker";
import { ListPositionsByUserRequest, ListPositionsByUserResponse } from "./actions/list_positions_by_user";
import { MarkBuyAsConfirmedRequest, MarkBuyAsConfirmedResponse } from "./actions/mark_buy_as_confirmed";
import { MarkPositionAsClosedRequest, MarkPositionAsClosedResponse } from "./actions/mark_position_as_closed";
import { MarkPositionAsClosingRequest, MarkPositionAsClosingResponse } from "./actions/mark_position_as_closing";
import { MarkPositionAsOpenRequest, MarkPositionAsOpenResponse } from "./actions/mark_position_as_open";
import { PositionExistsInTrackerRequest, PositionExistsInTrackerResponse } from "./actions/position_exists_in_tracker";
import { RemovePositionRequest, RemovePositionResponse } from "./actions/remove_position";
import { SetSellAutoDoubleOnOpenPositionInTrackerRequest } from "./actions/set_sell_auto_double_on_open_position_in_tracker";
import { SetSellSlippagePercentOnOpenPositionTrackerRequest } from "./actions/set_sell_slippage_percent_on_open_position";
import { UpdatePriceRequest, UpdatePriceResponse } from "./actions/update_price";
import { UpsertPositionsRequest, UpsertPositionsResponse } from "./actions/upsert_positions";
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

    initialized() : this is { vsTokenAddress : { value : string }, tokenAddress : { value : string } } {
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
                return await this.performTriggeredPriceUpdateActions(body);
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
            default:
                assertNever(method);
        }
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
            this.tokenPairPositionTracker.clearAllPositions();
            await this.state.storage.deleteAll();
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
        this.performWakupActions(); // deliberate lack of await
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

        for (const { type, pos } of allThingsToDo) {
            if (type === 'buy') {
                const buyConfirmPrefix = `<b>Confirming purchase of ${asTokenPrice(pos.tokenAmt)} ${pos.token.symbol}</b>: `;
                const channel = TGStatusMessage.createAndSend('In progress...', false, pos.chatID, this.env, 'HTML', buyConfirmPrefix);
                const confirmedBuy = await buyConfirmer.confirmBuy(pos);
                if (confirmedBuy === 'api-error') {
                    TGStatusMessage.queue(channel, "Confirmation failed.", false);
                    TGStatusMessage.queueRemoval(channel);
                    break;
                }
                else if (confirmedBuy === 'unconfirmed') {
                    TGStatusMessage.queue(channel, "Confirmation failed.", false);
                    TGStatusMessage.queueRemoval(channel);
                    continue;
                }
                else if (confirmedBuy === 'failed') {
                    TGStatusMessage.queue(channel, "On confirmation, we found that the purchase didn't go through.", true);
                    this.tokenPairPositionTracker.removePosition(pos.positionID);
                }
                else if ('positionID' in confirmedBuy) {
                    TGStatusMessage.queue(channel, "We were able to confirm this purchase!", true);
                    this.tokenPairPositionTracker.upsertPositions([confirmedBuy]);
                }
                else {
                    assertNever(confirmedBuy);
                }
                TGStatusMessage.finalize(channel);
            }
            else if (type === 'sell') {
                const confirmedSellStatus = await sellConfirmer.confirmSell(pos);
                const sellConfirmPrefix = ``;
                const channel = TGStatusMessage.createAndSend('In progress...', false, pos.chatID, this.env, 'HTML', sellConfirmPrefix);
                if (confirmedSellStatus === 'api-error') {
                    TGStatusMessage.queue(channel, "Confirmation failed.", false);
                    TGStatusMessage.queueRemoval(channel);
                    break;
                }
                else if (confirmedSellStatus === 'unconfirmed') {
                    TGStatusMessage.queue(channel, "Confirmation failed.", false);
                    TGStatusMessage.queueRemoval(channel);
                    continue;
                }
                else if (confirmedSellStatus === 'failed') {
                    TGStatusMessage.queue(channel, "On confirmation, we found that the sale didn't go through.", true);                
                    this.tokenPairPositionTracker.markPositionAsOpen(pos.positionID);
                }
                else if (confirmedSellStatus === 'slippage-failed') {
                    if (pos.sellAutoDoubleSlippage) {
                        const maxSlippage = 100; // TODO: make a user global setting
                        pos.sellSlippagePercent = Math.min(maxSlippage, 2 * pos.sellSlippagePercent);
                        TGStatusMessage.queue(channel, "The sale failed due to slippage.  We have increased the slippage to ${sellSlippagePercent}% and will retry soon.", true);
                        this.tokenPairPositionTracker.upsertPositions([pos]);
                    }
                    else {
                        TGStatusMessage.queue(channel, "The sale failed due to slippage. We will re-sell if the auto-sell trigger condition continues to hold.", true);
                    }
                    this.tokenPairPositionTracker.markPositionAsOpen(pos.positionID);
                }
                else if (isSuccessfullyParsedSwapSummary(confirmedSellStatus)) {
                    // TODO: update with PNL
                    const netPNL = dSub(pos.vsTokenAmt, confirmedSellStatus.swapSummary.outTokenAmt);
                    this.tokenPairPositionTracker.closePosition(pos.positionID, netPNL);
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


    async handleUpsertPositions(body : UpsertPositionsRequest) {
        this.ensureIsInitialized(body);

        const responseBody : UpsertPositionsResponse = {};
        
        // update the positions in the tracker.
        this.tokenPairPositionTracker.upsertPositions(body.positions);

        return makeJSONResponse(responseBody);
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
        logDebug(`TokenPairPositionTrackerDO ${this.tokenPairID()} - executing ${method}: ${jsonBody}`);
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