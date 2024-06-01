import { Connection } from "@solana/web3.js";
import { isAdminOrSuperAdmin } from "../../admins";
import { Wallet, encryptPrivateKey, generateEd25519Keypair } from "../../crypto";
import { DecimalizedAmount, asTokenPrice } from "../../decimalized/decimalized_amount";
import { Env, allowChooseAutoDoubleSlippage, allowChoosePriorityFees, getRPCUrl } from "../../env";
import { makeFailureResponse, makeJSONResponse, makeSuccessResponse, maybeGetJson } from "../../http";
import { logDebug, logError, logInfo } from "../../logging";
import { Position, PositionPreRequest, PositionRequest, PositionStatus, PositionType } from "../../positions";
import { POSITION_REQUEST_STORAGE_KEY } from "../../storage_keys";
import { TGStatusMessage, UpdateableNotification, sendMessageToTG } from "../../telegram";
import { WEN_ADDRESS, getVsTokenInfo } from "../../tokens";
import { ChangeTrackedValue, Intersect, Structural, Subtract, assertNever, ensureArrayIsAllAndOnlyPropsOf, ensureArrayIsOnlyPropsOf, groupIntoBatches, sleep, strictParseBoolean, strictParseInt } from "../../util";
import { assertIs } from "../../util/enums";
import { listUnclaimedBetaInviteCodes } from "../beta_invite_codes/beta_invite_code_interop";
import { PositionAndMaybePNL } from "../token_pair_position_tracker/model/position_and_PNL";
import { getTokenPrice } from "../token_pair_position_tracker/token_pair_position_tracker_DO_interop";
import { AdminDeleteAllPositionsRequest, AdminDeleteAllPositionsResponse } from "./actions/admin_delete_all_positions";
import { AdminDeleteClosedPositionsRequest } from "./actions/admin_delete_closed_positions";
import { AdminDeletePositionByIDRequest, AdminDeletePositionByIDResponse } from "./actions/admin_delete_position_by_id";
import { AdminResetDefaultPositionRequest, AdminResetDefaultPositionResponse } from "./actions/admin_reset_default_position_request";
import { AutomaticallyClosePositionsRequest, AutomaticallyClosePositionsResponse } from "./actions/automatically_close_positions";
import { BaseUserDORequest, isBaseUserDORequest } from "./actions/base_user_do_request";
import { DeactivatePositionRequest, DeactivatePositionResponse } from "./actions/deactivate_position";
import { DeleteSessionRequest, DeleteSessionResponse } from "./actions/delete_session";
import { DoubleSellSlippageRequest, DoubleSellSlippageResponse } from "./actions/double_sell_slippage";
import { EditTriggerPercentOnOpenPositionRequest, EditTriggerPercentOnOpenPositionResponse } from "./actions/edit_trigger_percent_on_open_position";
import { GetClosedPositionsAndPNLSummaryRequest, GetClosedPositionsAndPNLSummaryResponse } from "./actions/get_closed_positions_and_pnl_summary";
import { GetDeactivatedPositionRequest, GetDeactivatedPositionResponse } from "./actions/get_frozen_position";
import { GetImpersonatedUserIDRequest, GetImpersonatedUserIDResponse } from "./actions/get_impersonated_user_id";
import { GetLegalAgreementStatusRequest, GetLegalAgreementStatusResponse } from "./actions/get_legal_agreement_status";
import { GetPositionFromUserDORequest, GetPositionFromUserDOResponse } from "./actions/get_position_from_user_do";
import { GetSessionValuesRequest, GetSessionValuesWithPrefixRequest, GetSessionValuesWithPrefixResponse } from "./actions/get_session_values";
import { GetUserDataRequest } from "./actions/get_user_data";
import { GetUserWalletSOLBalanceRequest, GetUserWalletSOLBalanceResponse } from "./actions/get_user_wallet_balance";
import { GetWalletDataRequest, GetWalletDataResponse } from "./actions/get_wallet_data";
import { ImpersonateUserRequest, ImpersonateUserResponse } from "./actions/impersonate_user";
import { ListDeactivatedPositionsRequest, ListDeactivatedPositionsResponse } from "./actions/list_frozen_positions";
import { ListPositionsFromUserDORequest, ListPositionsFromUserDOResponse } from "./actions/list_positions_from_user_do";
import { ManuallyClosePositionRequest, ManuallyClosePositionResponse } from "./actions/manually_close_position";
import { OpenPositionRequest, OpenPositionResponse } from "./actions/open_new_position";
import { ReactivatePositionRequest, ReactivatePositionResponse } from "./actions/reactivate_position";
import { RegisterPositionAsClosedRequest, RegisterPositionAsClosedResponse } from "./actions/register_position_as_closed";
import { RegisterPositionAsDeactivatedRequest, RegisterPositionAsDeactivatedResponse } from "./actions/register_position_as_deactivated";
import { DefaultTrailingStopLossRequestRequest, DefaultTrailingStopLossRequestResponse } from "./actions/request_default_position_request";
import { SendMessageToUserRequest, SendMessageToUserResponse, isSendMessageToUserRequest } from "./actions/send_message_to_user";
import { SetOpenPositionSellPriorityFeeMultiplierRequest, SetOpenPositionSellPriorityFeeMultiplierResponse } from "./actions/set_open_position_sell_priority_fee_multiplier";
import { SetSellAutoDoubleOnOpenPositionRequest, SetSellAutoDoubleOnOpenPositionResponse } from "./actions/set_sell_auto_double_on_open_position";
import { SellSellSlippagePercentageOnOpenPositionRequest, SellSellSlippagePercentageOnOpenPositionResponse } from "./actions/set_sell_slippage_percent_on_open_position";
import { StoreLegalAgreementStatusRequest, StoreLegalAgreementStatusResponse } from "./actions/store_legal_agreement_status";
import { StoreSessionValuesRequest, StoreSessionValuesResponse } from "./actions/store_session_values";
import { UnimpersonateUserRequest, UnimpersonateUserResponse } from "./actions/unimpersonate_user";
import { ClosedPositionPNLSummarizer } from "./aggregators/closed_positions_pnl_summarizer";
import { UserDOBuyConfirmer } from "./confirmers/user_do_buy_confirmer";
import { UserDOSellConfirmer } from "./confirmers/user_do_sell_confirmer";
import { TokenPair } from "./model/token_pair";
import { UserData } from "./model/user_data";
import { PositionBuyer } from "./position_buyer";
import { PositionSeller } from "./position_seller";
import { ClosedPositionsTracker } from "./trackers/closed_positions_tracker";
import { DeactivatedPositionsTracker } from "./trackers/deactivated_positions_tracker";
import { OpenPositionsTracker, UpdatePriceResult } from "./trackers/open_positions_tracker";
import { SessionTracker } from "./trackers/session_tracker";
import { SOLBalanceTracker } from "./trackers/sol_balance_tracker";
import { UserDOFetchMethod, parseUserDOFetchMethod } from "./userDO_interop";

const DEFAULT_POSITION_PREREQUEST : PositionPreRequest = {
    userID: -1,
    chatID: -1,
    messageID: -1,
    positionID : "",
    positionType : PositionType.LongTrailingStopLoss,
    tokenAddress : WEN_ADDRESS, // to be subbed in
    vsToken : getVsTokenInfo('SOL'),
    vsTokenAmt : 1.0,
    slippagePercent : 5.0,
    triggerPercent : 5,
    sellAutoDoubleSlippage : false,
    priorityFeeAutoMultiplier: null, // TODO: set to 'auto' if feature flag on
};

/* Durable Object storing state of user */
export class UserDO {

    // boilerplate DO stuff
    env : Env;
    state: DurableObjectState;
    loadFromStorageFailed : boolean|undefined = undefined

    // user's ID
    telegramUserID : ChangeTrackedValue<number|null> = new ChangeTrackedValue<number|null>('telegramUserID', null);

    // most recent chatID with telegram
    chatID : ChangeTrackedValue<number|null> = new ChangeTrackedValue<number|null>("chatID", null);

    // if the user is impersonating someone, this is populated.
    // all other properties pertain to the 'real user' per telegramUserID, not the impersonated user
    impersonatedUserID : ChangeTrackedValue<number|null> = new ChangeTrackedValue<number|null>("impersonatedUserID", null);

    // the user's wallet
    wallet : ChangeTrackedValue<Wallet|null> = new ChangeTrackedValue<Wallet|null>('wallet', null, true);

    // keeps track of sol balance and when last refreshed.  Gets (rate-limited) latest balance on access.
    solBalanceTracker : SOLBalanceTracker = new SOLBalanceTracker();

    // the default values for a trailing sotp loss
    defaultTrailingStopLossRequest : ChangeTrackedValue<PositionPreRequest> = new ChangeTrackedValue<PositionPreRequest>("defaultTrailingStopLossRequest", structuredClone(DEFAULT_POSITION_PREREQUEST));

    // tracks variable values associated with the current messageID
    sessionTracker : SessionTracker = new SessionTracker();

    // has the user signed legal?
    legalAgreementStatus : ChangeTrackedValue<'agreed'|'refused'|'has-not-responded'> = new ChangeTrackedValue<'agreed'|'refused'|'has-not-responded'>('hasSignedLegal', 'has-not-responded');

    // stores just the positionID / tokenAddress / vsTokenAddress for open/closing positions
    //tokenPairsForPositionIDsTracker : TokenPairsForPositionIDsTracker = new TokenPairsForPositionIDsTracker();

    // stores the list of positions IDs (and respective token pair trackers) for the closed positions for this user
    //tokenPairsForClosedPositions : TokenPairTracker = new TokenPairTracker("closedPosition");

    // stores the list of positions IDs (and respective token pair trackers) for the deactivated positions for this user
    //tokenPairsForDeactivatedPositions : TokenPairTracker = new TokenPairTracker("deactivatedPosition");

    // the unrealized PNL from open positions
    //userOpenPNLTracker : UserOpenPNLTracker = new UserOpenPNLTracker();

    inbox: { from : string, message : string }[] = [];
    // TODO: way to make arrays compatible with ChangeTrackedValue?
    //inbox : ChangeTrackedValue<string[]> = new ChangeTrackedValue<string[]>("inbox", []);

    // I'm using this to have UserDOs self-schedule alarms as long as they have any positions
    // That way, an 'incoming request' happens every 10s, allowing the CPU limit to reset to 30s
    // This allows for longer-running processes.
    isAlarming : boolean = false;

    openPositions : OpenPositionsTracker = new OpenPositionsTracker();

    closedPositions : ClosedPositionsTracker = new ClosedPositionsTracker();

    deactivatedPositions : DeactivatedPositionsTracker = new DeactivatedPositionsTracker();

    constructor(state : DurableObjectState, env : any) {
        this.env                = env;
        this.state              = state;
        this.state.blockConcurrencyWhile(async () => {
            await this.loadStateFromStorage();
        });
    }

    async loadStateFromStorage() {
        logDebug("Loading userDO from storage");
        const storage = await this.state.storage.list();
        this.wallet.initialize(storage);
        this.telegramUserID.initialize(storage);
        this.impersonatedUserID.initialize(storage);
        this.sessionTracker.initialize(storage);
        this.solBalanceTracker.initialize(storage); // rate limits RPC calls. will refresh on access.
        this.legalAgreementStatus.initialize(storage);
        this.defaultTrailingStopLossRequest.initialize(storage);
        this.chatID.initialize(storage);
        this.openPositions.initialize(storage);
        this.closedPositions.initialize(storage);
        this.deactivatedPositions.initialize(storage);
        //logInfo("Loaded userDO from storage: ", this.telegramUserID.value);
    }

    async flushToStorage() {
        await Promise.allSettled([
            this.telegramUserID.flushToStorage(this.state.storage),
            this.impersonatedUserID.flushToStorage(this.state.storage),
            this.wallet.flushToStorage(this.state.storage),
            this.sessionTracker.flushToStorage(this.state.storage),
            this.solBalanceTracker.flushToStorage(this.state.storage),
            this.legalAgreementStatus.flushToStorage(this.state.storage),
            this.defaultTrailingStopLossRequest.flushToStorage(this.state.storage),
            this.openPositions.flushToStorage(this.state.storage),
            this.closedPositions.flushToStorage(this.state.storage),
            this.deactivatedPositions.flushToStorage(this.state.storage),
            this.chatID.flushToStorage(this.state.storage)
        ]);
    }

    async alarm(req : any, env : Env, context: FetchEvent) {
        
        try {
            await this.state.storage.deleteAlarm();
            await this.performAlarmActions(context);
            await this.maybeScheduleAlarm();
        }
        catch {
            logError(`Problem rescheduling alarm for ${this.telegramUserID.value}`);
        }
        finally {
            await this.flushToStorage();
        }
    }

    async maybeStartAlarming() {
        if (!this.isAlarming) {
            await this.maybeScheduleAlarm();
        }
    }

    async maybeScheduleAlarm() {
        if (this.shouldScheduleNextAlarm()) {
            this.isAlarming = true;
            await this.state.storage.setAlarm(Date.now() + 1000);
        }
        else {
            this.isAlarming = false;
        }
    }

    shouldScheduleNextAlarm() {
        if (strictParseBoolean(this.env.DOWN_FOR_MAINTENANCE)) {
            return false;
        }
        return this.openPositions.listPositions({ includeClosing: true, includeOpen : true, includeUnconfirmed : true, includeClosed : false }).length > 0;
    }

    async performAlarmActions(context : FetchEvent) {
        const tokenPairs = this.openPositions.listUniqueTokenPairs({ includeOpen: true, includeUnconfirmed : true, includeClosing : true, includeClosed : false });
        for (const tokenPair of tokenPairs) {
            const price = await this.getLatestPrice(tokenPair);
            if (price != null)  {
                const automaticActions = this.openPositions.updatePrice({ tokenPair, price, markTriggeredAsClosing: true });
                await this.initiateAutomaticActions(automaticActions, context);
            }
            else {
                logError("Unable to retrieve price", tokenPair);
            }
        }
    }

    async getLatestPrice(tokenPair : TokenPair) : Promise<DecimalizedAmount|null> {
        const response = await getTokenPrice(tokenPair.tokenAddress, tokenPair.vsTokenAddress, this.env);
        return response;
    }

    async initiateAutomaticActions(automaticAction : UpdatePriceResult, context: FetchEvent) {

        // all the actions performed here must be initiated within a certain time window.
        const startTimeMS = Date.now();
        
        // perform automatic sales, most expensive first.
        // TODO: timing out, concurrency, etc?
        automaticAction.triggeredTSLPositions.sort(p => -p.vsTokenAmt);
        for (const triggeredTSLPosition of automaticAction.triggeredTSLPositions) {
            await this.initiateAutomaticSale(triggeredTSLPosition.positionID, startTimeMS, context);
        }

        const allThingsToConfirm = this.combineConfirmationTasks({ buys: automaticAction.unconfirmedBuys, sells: automaticAction.unconfirmedSells })
        const connection = new Connection(getRPCUrl(this.env));
        const buyConfirmer = new UserDOBuyConfirmer(connection, startTimeMS, this.env, this.openPositions, this.closedPositions, this.deactivatedPositions);
        const sellConfirmer = new UserDOSellConfirmer(connection, startTimeMS, this.env, this.openPositions, this.closedPositions, this.deactivatedPositions);
 
        automaticAction.unconfirmedBuys.sort(p => -p.vsTokenAmt);
        for (const { type, position } of allThingsToConfirm) {
            if (type === 'buy') {
                if (buyConfirmer.isTimedOut()) {
                    continue;
                }
                const confirmedBuy = await buyConfirmer.maybeConfirmBuy(position.positionID);
                if (confirmedBuy === 'do-not-continue') {
                    break;
                }
            }
            else if (type === 'sell') {
                if (sellConfirmer.isTimedOut()) {
                    continue;
                }
                const confirmedSell = await sellConfirmer.maybeConfirmSell(position.positionID);
                if (confirmedSell === 'do-not-continue') {
                    break;
                }
            }
        }
    }

    combineConfirmationTasks(params: { buys: Position[], sells: Position[] }) : { type: 'buy'|'sell', position : Position }[] {
        const combinedList : { type: 'buy'|'sell', position : Position }[] = [];
        for (const buy of params.buys) {
            combinedList.push({ type: 'buy', position: buy });
        }
        for (const sell of params.sells) {  
            combinedList.push({ type: 'sell', position: sell });
        }
        combinedList.sort(item => -item.position.vsTokenAmt);
        return combinedList;
    }

    // TODO: batching and awaiting of batches (to limit the number of concurrent auto-sells)
    async initiateAutomaticSale(positionID : string, startTimeMS : number, context: FetchEvent) {
        const position = this.openPositions.getOpenConfirmedPosition(positionID);
        if (position == null) {
            return;
        }
        const channel = TGStatusMessage.createAndSend(`Initiating sale.`, false, position.chatID, this.env, 'HTML', `<a href="${position.token.logoURI}">\u200B</a><b>Manual Sale of ${asTokenPrice(position.tokenAmt)} ${position.token.symbol}</b>: `);
        const connection = new Connection(getRPCUrl(this.env));
        const timedOut = () => (Date.now() - startTimeMS) > strictParseInt(this.env.TX_TIMEOUT_MS);
        if (timedOut()) {
            return;
        }
        const positionSeller = new PositionSeller(connection, this.wallet.value!!, 'auto-sell', startTimeMS, channel, this.env, this.openPositions, this.closedPositions, this.deactivatedPositions);
        context.waitUntil(positionSeller.sell(positionID).finally(async () => {
            await this.flushToStorage();
        }));
    }

    initialized() : boolean {
        return (this.telegramUserID.value != null);
    }

    async fetch(request : Request, env : Env, context : FetchEvent) : Promise<Response> {
        try {
            const [method,jsonRequestBody,response] = await this._fetch(request, context);
            await this.maybeStartAlarming().catch(r => {
                logError(`Problem scheduling alarm for UserDO ${this.telegramUserID.value}`)
                return null;
            });
            return response;
        }
        catch(e) {
            logError("Error in userDO fetch", e, this.telegramUserID);
            return makeSuccessResponse();
        }
        finally {
            // deliberately not awaited.
            this.flushToStorage();
        }
    }

    async ensureIsInitialized(userAction : BaseUserDORequest) {
        // make sure telegramUserID is populated
        if (this.telegramUserID.value == null) {
            this.telegramUserID.value = userAction.telegramUserID;
        }
        else if (this.telegramUserID.value != null && this.telegramUserID.value != userAction.telegramUserID) {
            throw new Error(`telegram user IDs didn't match (request: ${userAction.telegramUserID}, state: ${this.telegramUserID.value})`);
        }

        // make sure the user certainly has no wallet (even if init of UserDO fails)
        // certainlyHasNoStoredValue means initialization was attempted and no stored value was found.
        if (this.wallet.certainlyHasNoStoredValue()) {
            if (this.wallet.value == null) {
                this.wallet.value = await this.generateWallet();
            }
            else {
                logError("CRITICAL: Tried to overwrite non-null wallet.")
            }
        }

        // set most recent chat ID.
        if (userAction.chatID > 0) {
            this.chatID.value = userAction.chatID;
        }
    }

    async _fetch(request : Request, context : FetchEvent) : Promise<[UserDOFetchMethod,any,Response]> {

        const [method,userAction] = await this.validateFetchRequest(request);

        logDebug(`[[${method}]] :: user_DO :: ${this.telegramUserID.value}`);

        let response : Response|null = null;

        switch(method) {
            case UserDOFetchMethod.get:
                response = await this.handleGet(userAction);            
                break;
            case UserDOFetchMethod.storeSessionValues:
                response = await this.handleStoreSessionValues(userAction);
                break;
            case UserDOFetchMethod.getSessionValues:
                response = await this.handleGetSessionValues(userAction);
                break;
            case UserDOFetchMethod.getSessionValuesWithPrefix:
                response = this.handleGetSessionValuesWithPrefix(userAction);
                break;
            case UserDOFetchMethod.getDefaultTrailingStopLossRequest:
                response = this.handleGetDefaultTrailingStopLossRequest(userAction);
                break;
            case UserDOFetchMethod.deleteSession:
                response = await this.handleDeleteSession(userAction);
                break;
            case UserDOFetchMethod.getWalletData:
                this.assertUserHasWallet();
                response = await this.handleGetWalletData(userAction);
                break;
            case UserDOFetchMethod.openNewPosition:
                this.assertUserHasWallet();
                response = await this.handleOpenNewPosition(userAction, context);
                break;
            case UserDOFetchMethod.manuallyClosePosition:
                this.assertUserHasWallet();
                response = await this.handleManuallyClosePositionRequest(userAction, context);
                break;
            case UserDOFetchMethod.automaticallyClosePositions:
                this.assertUserHasWallet();
                response = await this.handleAutomaticallyClosePositionsRequest(userAction);
                break;
            case UserDOFetchMethod.getLegalAgreementStatus:
                response = await this.handleGetLegalAgreementStatus(userAction);
                break;
            case UserDOFetchMethod.storeLegalAgreementStatus:
                response = await this.handleStoreLegalAgreementStatus(userAction);
                break;
            case UserDOFetchMethod.getImpersonatedUserID:
                response = await this.handleGetImpersonatedUserID(userAction);
                break;
            case UserDOFetchMethod.impersonateUser:
                response = await this.handleImpersonateUser(userAction);
                break;
            case UserDOFetchMethod.unimpersonateUser:
                response = await this.handleUnimpersonateUser(userAction);
                break;
            case UserDOFetchMethod.getPositionFromUserDO:
                response = await this.handleGetPositionFromUserDO(userAction);
                break;
            case UserDOFetchMethod.listPositionsFromUserDO:
                response = await this.handleListPositionsFromUserDO(userAction);
                break;
            case UserDOFetchMethod.sendMessageToUser:
                response = await this.handleSendMessageToUser(userAction);
                break;
            case UserDOFetchMethod.editTriggerPercentOnOpenPosition:
                response = await this.handleEditTriggerPercentOnOpenPosition(userAction);
                break;
            case UserDOFetchMethod.setSellAutoDoubleOnOpenPositionRequest:
                response = await this.handleSetSellAutoDoubleOnOpenPositionRequest(userAction);
                break;
            case UserDOFetchMethod.adminDeleteAllPositions:
                response = await this.handleAdminDeleteAllPositions(userAction);
                break;
            case UserDOFetchMethod.setSellSlippagePercentOnOpenPosition:
                response = await this.handleSellSlippagePercentOnOpenPosition(userAction);
                break;
            case UserDOFetchMethod.getUserWalletSOLBalance:
                response = await this.handleGetUserWalletSOLBalance(userAction);
                break;
            case UserDOFetchMethod.getClosedPositionsAndPNLSummary:
                response = await this.handleGetClosedPositionsAndPNLSummary(userAction);
                break;
            case UserDOFetchMethod.adminDeleteClosedPositions:
                response = await this.handleDeleteClosedPositions(userAction);
                break;
            case UserDOFetchMethod.adminResetDefaultPositionRequest:
                response = await this.handleResetDefaultPositionRequest(userAction);
                break;
            case UserDOFetchMethod.adminDeletePositionByID:
                response = await this.handleAdminDeletePositionByID(userAction);
                break;
            case UserDOFetchMethod.listDeactivatedPositions:
                response = await this.handleListDeactivatedPositions(userAction);
                break;
            case UserDOFetchMethod.deactivatePosition:
                response = await this.handleDeactivatePosition(userAction);
                break;
            case UserDOFetchMethod.reactivatePosition:
                response = await this.handleReactivatePosition(userAction);
                break;
            case UserDOFetchMethod.getDeactivatedPosition:
                response = await this.handleGetDeactivatedPosition(userAction);
                break;
            case UserDOFetchMethod.doubleSellSlippage:
                response = await this.handleDoubleSellSlippage(userAction);
                break;
            case UserDOFetchMethod.setOpenPositionSellPriorityFee:
                response = await this.handleSetOpenPositionPriorityFee(userAction);
                break;
            case UserDOFetchMethod.registerPositionAsClosed:
                response = await this.handleRegisterPositionAsClosed(userAction);
                break;
            case UserDOFetchMethod.registerPositionAsDeactivated:
                response = await this.handleRegisterPositionAsDeactivated(userAction);
                break;
            default:
                assertNever(method);
        }

        return [method,userAction,response];
    }

    async handleRegisterPositionAsClosed(userAction : RegisterPositionAsClosedRequest) : Promise<Response> {
        await this.registerPositionAsClosed(userAction.positionID, userAction.tokenAddress, userAction.vsTokenAddress);
        return makeJSONResponse<RegisterPositionAsClosedResponse>({ success: true });
    }

    // CRUFT
    async registerPositionAsClosed(positionID : string, tokenAddress : string, vsTokenAddress : string) {
        //this.tokenPairsForPositionIDsTracker.removePositions([positionID]);
        //const tokenPair = { positionID: positionID, token : { address : tokenAddress }, vsToken: { address : vsTokenAddress } };
        //this.tokenPairsForClosedPositions.registerPosition(tokenPair);
        this.closePosition(positionID);
    }

    closePosition(positionID : string) {
        const position = this.openPositions.markAsClosedAndReturn(positionID);
        if (position != null) {
            this.closedPositions.upsert(position);
        }
    }

    async handleRegisterPositionAsDeactivated(userAction: RegisterPositionAsDeactivatedRequest) : Promise<Response> {
        const response = await this.handleRegisterPositionAsDeactivatedInternal(userAction);
        return makeJSONResponse<RegisterPositionAsDeactivatedResponse>(response);
    }

    // CRUFT
    // If a position was automatically deactivated by the price tracker, we must mark it as deactivated here.
    async handleRegisterPositionAsDeactivatedInternal(userAction : RegisterPositionAsDeactivatedRequest) : Promise<RegisterPositionAsDeactivatedResponse> {
        const position = this.openPositions.deactivateAndReturn(userAction.positionID);
        if (position != null) {
            this.deactivatedPositions.upsert(position);
            return { success: true };
        }
        return { success: false };
        //this.tokenPairsForPositionIDsTracker.removePositions([userAction.positionID]);
        //const tokenPair = { positionID: userAction.positionID, token : { address : userAction.tokenAddress }, vsToken: { address : userAction.vsTokenAddress } };
        //this.tokenPairsForDeactivatedPositions.registerPosition(tokenPair);
        //return { success: true };
    }

    async handleSetOpenPositionPriorityFee(userAction : SetOpenPositionSellPriorityFeeMultiplierRequest) : Promise<Response> {
        const response = await this.handleSetOpenPositionPriorityFeeInternal(userAction);
        return makeJSONResponse<SetOpenPositionSellPriorityFeeMultiplierResponse>(response);
    }

    async handleSetOpenPositionPriorityFeeInternal(userAction : SetOpenPositionSellPriorityFeeMultiplierRequest) : Promise<SetOpenPositionSellPriorityFeeMultiplierResponse> {
        this.openPositions.mutateOpenConfirmedPosition(userAction.positionID, p => {
            p.sellPriorityFeeAutoMultiplier = userAction.multiplier;
        });
        return { };
    }

    async handleDoubleSellSlippage(userAction : DoubleSellSlippageRequest) : Promise<Response> {
        const response = await this.handleDoubleSellSlippageInternal(userAction);
        return makeJSONResponse<DoubleSellSlippageResponse>(response);
    }

    async handleDoubleSellSlippageInternal(userAction : DoubleSellSlippageRequest) : Promise<DoubleSellSlippageResponse> {
        this.openPositions.mutateOpenConfirmedPosition(userAction.positionID, p => {
            p.sellSlippagePercent = Math.min(p.sellSlippagePercent * 2);
        });
        return { };
    }

    async handleGetDeactivatedPosition(userAction : GetDeactivatedPositionRequest) : Promise<Response> {
        const response = await this.handleGetDeactivatedPositionInternal(userAction);
        return makeJSONResponse<GetDeactivatedPositionResponse>(response);
    }

    async handleGetDeactivatedPositionInternal(userAction : GetDeactivatedPositionRequest) : Promise<GetDeactivatedPositionResponse> {
        const deactivatedPosition = this.deactivatedPositions.get(userAction.positionID);
        return { deactivatedPosition : deactivatedPosition };
    }

    async handleListDeactivatedPositions(userAction : ListDeactivatedPositionsRequest) : Promise<Response> {
        const response = this.handleListDeactivatedPositionsInternal(userAction);
        return makeJSONResponse<ListDeactivatedPositionsResponse>(response);
    }

    handleListDeactivatedPositionsInternal(userAction : ListDeactivatedPositionsRequest) : ListDeactivatedPositionsResponse {
        return  {
            deactivatedPositions: this.deactivatedPositions.listDeactivatedPositions()
        };
    }

    async handleDeactivatePosition(userAction : DeactivatePositionRequest) : Promise<Response> {
        const response = await this.handleDeactivatePositionInternal(userAction);
        return makeJSONResponse<DeactivatePositionResponse>(response);
    }    

    async handleDeactivatePositionInternal(userAction : DeactivatePositionRequest) : Promise<DeactivatePositionResponse> {
        const position = this.openPositions.deactivateAndReturn(userAction.positionID);
        if (position == null) {
            return { success: false };
        }
        this.deactivatedPositions.upsert(position);
        return { success: true };
    }

    async handleReactivatePosition(userAction : ReactivatePositionRequest) : Promise<Response> {
        const response = await this.handleReactivatePositionInternal(userAction);
        return makeJSONResponse<ReactivatePositionResponse>(response);
    }        

    async handleReactivatePositionInternal(userAction : ReactivatePositionRequest) : Promise<ReactivatePositionResponse> {
        const position = this.deactivatedPositions.get(userAction.positionID);
        if (position != null) {
            this.openPositions.reactivatePosition(position);
            return { success : true };
        }
        return { success : false };
    }

    async handleAdminDeletePositionByID(userAction: AdminDeletePositionByIDRequest) : Promise<Response> {
        const success = this.openPositions.deletePosition(userAction.positionID);
        return makeJSONResponse<AdminDeletePositionByIDResponse>({ success });
    }

    async handleDeleteClosedPositions(userAction : AdminDeleteClosedPositionsRequest) : Promise<Response> {
        /*const userID = userAction.telegramUserID;
        const uniqueTokenPairs = this.tokenPairsForClosedPositions.listUniqueTokenPairs();
        for (const pair of uniqueTokenPairs) {
            await adminDeleteClosedPositionsForUser(userAction.telegramUserID, pair.tokenAddress, pair.vsTokenAddress, this.env);
        }
        const response : AdminDeleteAllPositionsResponse = {};
        return makeJSONResponse<AdminDeleteAllPositionsResponse>(response);*/
        this.closedPositions.clear();
        return makeJSONResponse<AdminDeleteAllPositionsResponse>({});
    }

    async handleResetDefaultPositionRequest(userAction: AdminResetDefaultPositionRequest) : Promise<Response> {
        this.defaultTrailingStopLossRequest.value = structuredClone(DEFAULT_POSITION_PREREQUEST);
        const response : AdminResetDefaultPositionResponse = {};
        return makeJSONResponse<AdminResetDefaultPositionResponse>(response);
    }

    async handleGetClosedPositionsAndPNLSummary(userAction : GetClosedPositionsAndPNLSummaryRequest) : Promise<Response> {
        const response = await this.handleGetClosedPositionsAndPNLSummaryInternal(userAction)
        return makeJSONResponse<GetClosedPositionsAndPNLSummaryResponse>(response);
    }

    async handleGetClosedPositionsAndPNLSummaryInternal(userAction : GetClosedPositionsAndPNLSummaryRequest) : Promise<GetClosedPositionsAndPNLSummaryResponse> {
        const closedPositions = this.closedPositions.listClosedPositions();
        const closedPositionPNLSummarizer = new ClosedPositionPNLSummarizer();
        for (const closedPosition of closedPositions) {
            closedPositionPNLSummarizer.update(closedPosition);
        }
        const closedPositionsPNLSummary = closedPositionPNLSummarizer.getSummary();
        return { closedPositions, closedPositionsPNLSummary }
    }

    async handleGetUserWalletSOLBalance(userAction : GetUserWalletSOLBalanceRequest) : Promise<Response> {
        if (this.wallet.value == null) {
            return makeJSONResponse<GetUserWalletSOLBalanceResponse>({ maybeSOLBalance : null });
        }
        const maybeSOLBalance = await this.solBalanceTracker.maybeGetBalance(this.wallet.value.publicKey, false, this.env)
        return makeJSONResponse<GetUserWalletSOLBalanceResponse>({ maybeSOLBalance });
    }

    async handleSellSlippagePercentOnOpenPosition(userAction : SellSellSlippagePercentageOnOpenPositionRequest) : Promise<Response> {
        const result = await this.handleSellSlippagePercentOnOpenPositionInternal(userAction);
        return makeJSONResponse<SellSellSlippagePercentageOnOpenPositionResponse>(result);
    }

    async handleSellSlippagePercentOnOpenPositionInternal(userAction : SellSellSlippagePercentageOnOpenPositionRequest) : Promise<SellSellSlippagePercentageOnOpenPositionResponse> {
        const position = this.openPositions.mutateOpenConfirmedPosition(userAction.positionID, (position) => {
            position.sellSlippagePercent = userAction.sellSlippagePercent;
        });
        if (position != null) {
            return { positionAndMaybePNL: this.openPositions.getPositionAndMaybePnL(userAction.positionID)||null };
        }
        return { positionAndMaybePNL: null };
    }

    async handleAdminDeleteAllPositions(userAction : AdminDeleteAllPositionsRequest) : Promise<Response> {
        const response = this.handleAdminDeleteAllPositionsInternal(userAction);
        return makeJSONResponse<AdminDeleteAllPositionsResponse>(response);
    }

    async handleAdminDeleteAllPositionsInternal(userAction : AdminDeleteAllPositionsRequest) : Promise<AdminDeleteAllPositionsResponse> {
        const realUserID = userAction.realTelegramUserID;

        if (!isAdminOrSuperAdmin(realUserID, this.env)) {
            logError(`Only admin user can delete all positions - was ${realUserID}`);
            return {};
        }

        if (this.env.ENVIRONMENT === 'dev' || this.env.ENVIRONMENT === 'beta') {
            this.openPositions.clear();
            return {};
        }
        
        return {};
    }

    private async handleSetSellAutoDoubleOnOpenPositionRequest(userAction : SetSellAutoDoubleOnOpenPositionRequest) : Promise<Response> {
        const response = this.handleSetSellAutoDoubleOnOpenPositionRequestInternal(userAction);
        return makeJSONResponse<SetSellAutoDoubleOnOpenPositionResponse>(response);
    }

    private handleSetSellAutoDoubleOnOpenPositionRequestInternal(userAction: SetSellAutoDoubleOnOpenPositionRequest) : SetSellAutoDoubleOnOpenPositionResponse {
        this.openPositions.mutateOpenConfirmedPosition(userAction.positionID, (position) => { 
            position.sellAutoDoubleSlippage = userAction.choice
        });
        return {};
    }

    async handleEditTriggerPercentOnOpenPosition(request: EditTriggerPercentOnOpenPositionRequest) : Promise<Response> {
        const response = this.handleEditTriggerPercentOnOpenPositionInternal(request);
        return makeJSONResponse<EditTriggerPercentOnOpenPositionResponse>(response);
    }

    handleEditTriggerPercentOnOpenPositionInternal(request : EditTriggerPercentOnOpenPositionRequest) : EditTriggerPercentOnOpenPositionResponse {
        const percent = request.percent;
        if (percent <= 0 || percent >= 100) {
            return 'invalid-percent';
        }
        const position = this.openPositions.mutateOpenConfirmedPosition(request.positionID, (position) => {
            position.triggerPercent = request.percent;
        });
        // 'position-DNE'|'is-closing'|'is-closed'|'invalid-percent'
        if (this.closedPositions.has(request.positionID)) {
            return 'is-closed';
        }
        const status = this.openPositions.getProperty(request.positionID, (p) => p.status);
        if (status == PositionStatus.Closing) {
            return 'is-closing';
        }
        const positionAndMaybePnL = this.openPositions.getPositionAndMaybePnL(request.positionID);
        if (positionAndMaybePnL == null) {
            return 'position-DNE';
        }
        return positionAndMaybePnL;
    }

    async handleSendMessageToUser(request : SendMessageToUserRequest) : Promise<Response> {
        await this.handleSendMessageToUserInternal(request);
        const response: SendMessageToUserResponse = {};
        return makeJSONResponse(response);
    }

    async handleSendMessageToUserInternal(request : SendMessageToUserRequest) : Promise<void> {
        this.inbox.push({ from: request.fromTelegramUserName,  message: request.message });
        if (this.chatID.value == null) {
            return;
        }
        const chatID = this.chatID.value;
        const sendSuccessIdxs : number[] = [];
        this.inbox.forEach(async (message,index) => {
            let messageWithContext = `$<b>${message.from} - ${this.env.TELEGRAM_BOT_INSTANCE_DISPLAY_NAME}</b>: ${message.message}`;
            if (this.telegramUserID.value != null && isAdminOrSuperAdmin(this.telegramUserID.value, this.env)) {
                messageWithContext += `(from user ID: ${request.fromTelegramUserID})`;
            }
            const result = await sendMessageToTG(chatID, messageWithContext, this.env);
            if (result.success) {
                sendSuccessIdxs.push(index);
            }
            if (index !== this.inbox.length - 1) {
                sleep(500);
            }  
        });
        const inboxMinusSentMessages : { from : string, message:string }[] = [];
        this.inbox.forEach((message,index) => {
            if (!sendSuccessIdxs.includes(index)) {
                inboxMinusSentMessages.push(message);
            }
        })
        this.inbox = inboxMinusSentMessages;
    }

    async handleGetPositionFromUserDO(request : GetPositionFromUserDORequest) : Promise<Response> {
        const position = this.openPositions.getPositionAndMaybePnL(request.positionID);
        return makeJSONResponse<GetPositionFromUserDOResponse>({ position });
    }

    async handleListPositionsFromUserDO(request : ListPositionsFromUserDORequest) : Promise<Response> {
        const positions = this.openPositions.listPositions({ includeUnconfirmed: true, includeClosing: true, includeOpen: true, includeClosed: false  });
        const maybeResults = positions.map(p => this.openPositions.getPositionAndMaybePnL(p.positionID));
        const results : PositionAndMaybePNL[] = [];
        for (const maybeResult of maybeResults) {
            if (maybeResult != null) {
                results.push(maybeResult);
            }
        }
        const response : ListPositionsFromUserDOResponse = { positions: results };
        return makeJSONResponse(response);
    }
    
    async handleImpersonateUser(request : ImpersonateUserRequest) : Promise<Response> {
        this.impersonatedUserID.value = request.userIDToImpersonate;
        const responseBody : ImpersonateUserResponse = { };
        return makeJSONResponse(responseBody);
    }

    async handleUnimpersonateUser(request : UnimpersonateUserRequest) : Promise<Response> {
        this.impersonatedUserID.value = null;
        const responseBody : UnimpersonateUserResponse = { };
        return makeJSONResponse(responseBody);
    }

    async handleGetImpersonatedUserID(request : GetImpersonatedUserIDRequest) : Promise<Response> {
        const responseBody : GetImpersonatedUserIDResponse = { impersonatedUserID : this.impersonatedUserID.value };
        return makeJSONResponse(responseBody);
    }

    async handleGetLegalAgreementStatus(request : GetLegalAgreementStatusRequest) : Promise<Response> {
        const responseBody : GetLegalAgreementStatusResponse = { status: this.legalAgreementStatus.value };
        return makeJSONResponse(responseBody);
    }

    async handleStoreLegalAgreementStatus(request : StoreLegalAgreementStatusRequest) : Promise<Response> {
        this.legalAgreementStatus.value = request.status;
        const responseBody : StoreLegalAgreementStatusResponse = {};
        return makeJSONResponse(responseBody);
    }

    handleGetSessionValuesWithPrefix(request : GetSessionValuesWithPrefixRequest) : Response {
        const messageID = request.messageID;
        const prefix = request.prefix;
        const sessionValues = this.sessionTracker.getSessionValuesWithPrefix(messageID, prefix);
        const responseBody : GetSessionValuesWithPrefixResponse = {
            values: sessionValues
        };
        return makeJSONResponse(responseBody);
    }

    handleGetDefaultTrailingStopLossRequest(defaultTrailingStopLossRequestRequest : DefaultTrailingStopLossRequestRequest) : Response {
        const defaultPrerequest = structuredClone(this.defaultTrailingStopLossRequest.value);
        defaultPrerequest.userID = defaultTrailingStopLossRequestRequest.telegramUserID;
        defaultPrerequest.chatID = defaultTrailingStopLossRequestRequest.chatID;
        defaultPrerequest.messageID = defaultTrailingStopLossRequestRequest.messageID;
        if (!allowChoosePriorityFees(this.env)) {
            defaultPrerequest.priorityFeeAutoMultiplier = null;
        }
        if (!allowChooseAutoDoubleSlippage(this.env)) {
            defaultPrerequest.sellAutoDoubleSlippage = false;
        }
        defaultPrerequest.positionID = crypto.randomUUID();
        if (defaultTrailingStopLossRequestRequest.token != null) {
            defaultPrerequest.tokenAddress = defaultTrailingStopLossRequestRequest.token.address;
        }
        const responseBody : DefaultTrailingStopLossRequestResponse = { prerequest: defaultPrerequest };
        return makeJSONResponse(responseBody);
    }

    /* Handles any exceptions and turns them into failure responses - fine because UserDO doesn't talk directly to TG */
    async catchResponse(promise : Promise<Response>) : Promise<Response> {
        return promise.catch((reason) => {
            return makeFailureResponse(reason.toString());
        });
    }

    async handleGet(jsonRequestBody : GetUserDataRequest) : Promise<Response> {
        const messageID = jsonRequestBody.messageID;
        const forceRefreshSOLBalance = jsonRequestBody.forceRefreshBalance;
        const telegramUserID = jsonRequestBody.telegramUserID;
        return makeJSONResponse(await this.makeUserData(telegramUserID, forceRefreshSOLBalance));
    }

    async handleDeleteSession(jsonRequestBody : DeleteSessionRequest) : Promise<Response> {
        const messageID = jsonRequestBody.messageID;
        this.sessionTracker.deleteSession(messageID);
        return await this.sessionTracker.flushToStorage(this.state.storage).then(() => {
            return makeJSONResponse<DeleteSessionResponse>({});
        });
    }

    async handleStoreSessionValues(jsonRequestBody : StoreSessionValuesRequest) : Promise<Response> {
        const messageID = jsonRequestBody.messageID;
        for (const sessionKey of Object.keys(jsonRequestBody.sessionValues)) {
            const value = jsonRequestBody.sessionValues[sessionKey];
            this.sessionTracker.storeSessionValue(messageID, sessionKey, value);
            this.maybeWriteToDefaultPositionPrerequest(sessionKey, value); // hack
        }
        return await this.sessionTracker.flushToStorage(this.state.storage).then(() => {
            return makeJSONResponse<StoreSessionValuesResponse>({});
        });
    }

    /* 
        TODO: This is a major, awful hack.  At the very least the backing instance should be a PositionRequest so the types match.
        The purpose is to intercept sessionProperty writes to PositionRequest and set them on the default position request.
        That way, the default 'remembers' whatever the user did last time.
    */
    maybeWriteToDefaultPositionPrerequest(sessionKey : string, value : any) {

        if (sessionKey.startsWith(POSITION_REQUEST_STORAGE_KEY)) {
            
            const sessionProperty = sessionKey.split("/")[1];
            
            // never overwrite these properties
            const dont_overwrite_these  = ensureArrayIsOnlyPropsOf<PositionPreRequest>()([ 'userID', 'chatID', 'positionID', 'messageID', 'positionID' ] as const) as string[];
            if (dont_overwrite_these.includes(sessionProperty)) {
                return;
            }

            // make token.address on the positionRequest to tokenAddress on the positionPreRequest
            const tokenProp : keyof PositionRequest = 'token';
            if (sessionProperty === tokenProp) {
                const tokenAddress = (value as any)?.address;
                if (tokenAddress != null && typeof tokenAddress === 'string') {
                    this.defaultTrailingStopLossRequest.value.tokenAddress = tokenAddress;
                }      
            }            
            
            // Never copy these positionRequest-only properties over to the positionPrerequest
            const positionRequestOnlyProperties  = ensureArrayIsAllAndOnlyPropsOf<Subtract<PositionRequest,PositionPreRequest>>()([ "quote","token" ] as const) as string[];
            if (positionRequestOnlyProperties.includes(sessionProperty)) {
                return;
            }
            // But you can write to these because they are properties in common!
            const commonProperties = ensureArrayIsAllAndOnlyPropsOf<Omit<Intersect<PositionRequest,PositionPreRequest>,'userID'|'chatID'|'messageID'|'positionID'>>()([
                'positionType',
                'vsToken',
                'vsTokenAmt',
                'slippagePercent',
                'triggerPercent',
                'sellAutoDoubleSlippage',
                'priorityFeeAutoMultiplier'
            ] as const);
            if ((commonProperties as readonly string[]).includes(sessionProperty)) {
                (this.defaultTrailingStopLossRequest.value as any)[sessionProperty] = value;
            }           
        }        
    }

    async handleGetSessionValues(jsonRequestBody : GetSessionValuesRequest) : Promise<Response> {
        const messageID = jsonRequestBody.messageID;
        const sessionValues : Record<string,Structural> = {};
        for (const sessionKey of jsonRequestBody.sessionKeys) {
            const value = this.sessionTracker.getSessionValue(messageID, sessionKey);
            sessionValues[sessionKey] = value;
        }
        const response = makeJSONResponse({
            sessionValues: sessionValues
        });
        return response;
    }

    async generateWallet() : Promise<Wallet> {
        const { publicKey, privateKey } = await generateEd25519Keypair();
        return {
            telegramUserID: this.telegramUserID.value!!,
            publicKey: publicKey,
            encryptedPrivateKey: await encryptPrivateKey(privateKey, this.telegramUserID.value!!, this.env)
        };        
    }

    async handleGetWalletData(request : GetWalletDataRequest) : Promise<Response> {
        return makeJSONResponse<GetWalletDataResponse>({
            wallet : this.wallet.value!!
        });
    }

    async handleOpenNewPosition(openPositionRequest : OpenPositionRequest, context : FetchEvent) : Promise<Response> {
        const startTimeMS = Date.now();
        const positionRequest = openPositionRequest.positionRequest;       

        // non-blocking notification channel to push update messages to TG
        const channel = TGStatusMessage.replaceWithNotification(
            positionRequest.messageID, 
            `Initiating swap...`, 
            false, 
            positionRequest.chatID, 
            this.env,
            'HTML',
            `<a href="${positionRequest.token.logoURI}">\u200B</a><b>${positionRequest.vsTokenAmt} SOL purchase of $${positionRequest.token.symbol}</b>: `);

        const positionBuyer = new PositionBuyer(this.wallet.value!!, this.env, startTimeMS, channel, this.openPositions, this.closedPositions, this.deactivatedPositions);    
        
        // fire-and-forget here, lack of await, but writes to storage when complete
        context.waitUntil(
            positionBuyer.buy(positionRequest).finally(async () => {
                await this.flushToStorage();
        }));

        
        return makeJSONResponse<OpenPositionResponse>({});
    }

    async handleManuallyClosePositionRequest(manuallyClosePositionRequest : ManuallyClosePositionRequest, context: FetchEvent) : Promise<Response> {
        const response = await this.handleManuallyClosePositionRequestInternal(manuallyClosePositionRequest, context);
        return makeJSONResponse<ManuallyClosePositionResponse>(response);
    }
    
    async handleManuallyClosePositionRequestInternal(manuallyClosePositionRequest : ManuallyClosePositionRequest, context : FetchEvent) : Promise<ManuallyClosePositionResponse> {
        const startTimeMS = Date.now();
        const result = await this.manuallyClosePosition(manuallyClosePositionRequest.positionID, startTimeMS, context);
        if (result.success === false) {
            return result;
        }
        // This may seem weird, but really we have to wait until later for the sale to be confirmed.
        return { success: null, reason: 'attempting-sale' };
    }

    async manuallyClosePosition(positionID  : string, startTimeMS : number, context : FetchEvent) : Promise<{ success: false, reason: 'position-DNE'|'position-closing'|'position-closed'|'buy-unconfirmed' }|{ success: null, reason: 'attempting-sale' }> {
        const position = this.openPositions.get(positionID);
        if (position == null) {
            return { success: false, reason: "position-DNE" };
        }
        if (position.status == PositionStatus.Closing) {
            return { success: false, reason: 'position-closing' };
        }
        else if (position.status === PositionStatus.Closed) {
            return { success: false, reason: 'position-closed' };
        }
        else if (!position.buyConfirmed) {
            return { success: false, reason: 'buy-unconfirmed' };
        }
        assertIs<PositionStatus.Open,typeof position.status>();
        const channel = TGStatusMessage.createAndSend(`Initiating sale.`, false, position.chatID, this.env, 'HTML', `<a href="${position.token.logoURI}">\u200B</a><b>Manual Sale of ${asTokenPrice(position.tokenAmt)} ${position.token.symbol}</b>: `);
        const connection = new Connection(getRPCUrl(this.env));
        const positionSeller = new PositionSeller(connection, this.wallet.value!!, 'manual-sell', startTimeMS, channel, this.env, this.openPositions, this.closedPositions, this.deactivatedPositions);
        this.openPositions.mutatePosition(positionID, p => {
            p.status = PositionStatus.Closing;
        });
        // deliberate lack of await here (fire-and-forget). But still writes to storage.  
        context.waitUntil(positionSeller.sell(position.positionID).finally(async () => {
            await this.flushToStorage();
        }));
        // success is indeterminate (by design) (explanation: depends on what happens with the positionSeller.sell, which is unawaited, so we don't know the result yet, hence 'null')
        return { success: null, reason: 'attempting-sale' };
    }

    async handleAutomaticallyClosePositionsRequest(closePositionsRequest : AutomaticallyClosePositionsRequest) : Promise<Response> {
        const startTimeMS = Date.now();
        const positionsToClose = closePositionsRequest.positions;
        if (positionsToClose.length == 0) {
            return makeJSONResponse<AutomaticallyClosePositionsResponse>({});
        }
        const positionBatches = groupIntoBatches(positionsToClose,4);
        const channels : UpdateableNotification[] = [ ];
        const connection = new Connection(getRPCUrl(this.env));
        const timedOut = () => (Date.now() - startTimeMS) > strictParseInt(this.env.TX_TIMEOUT_MS);
        for (const positionBatch of positionBatches) {
            // fire off a bunch of promises per batch (4)
            if (timedOut()) {
                continue;
            }
            let sellPositionPromises = positionBatch.map(async position => {
                const channel = TGStatusMessage.createAndSend(`Initiating.`, false, this.chatID.value||0, this.env, 'HTML', `:notify: <b>Automatic Sale of ${asTokenPrice(position.tokenAmt)} $${position.token.symbol}</b>: `);
                channels.push(channel);
                const positionSeller = new PositionSeller(connection, this.wallet.value!!, 'auto-sell', startTimeMS, channel, this.env, this.openPositions, this.closedPositions, this.deactivatedPositions);
                if (timedOut()) {
                    return;
                }
                // deliberate lack of await here, but still writes to storage afterwards
                const sellPromise = positionSeller.sell(position).then(async status => {
                    if (status === 'confirmed') {
                        await this.registerPositionAsClosed(position.positionID, position.token.address, position.vsToken.address);
                    }
                }).finally(async () => {
                    await this.flushToStorage();
                });
                return await sellPromise;
            });
            // but wait for the entire batch to settle before doing the next batch
            await Promise.allSettled(sellPositionPromises);
        }
        // fire and forget, finalize all channels
        Promise.allSettled(channels.map(channel => TGStatusMessage.finalize(channel)));
        return makeJSONResponse<AutomaticallyClosePositionsResponse>({});
    }

    async validateFetchRequest(request : Request) : Promise<[UserDOFetchMethod,any]> {

        const methodName = new URL(request.url).pathname.substring(1);

        const method : UserDOFetchMethod|null = parseUserDOFetchMethod(methodName);
        
        if (method == null) {
            throw new Error(`Unknown method ${method}`);
        }

        const jsonBody = await maybeGetJson(request);

        if (jsonBody == null) {
            throw new Error(`No JSON body in UserDO request - ${method}`)
        }

        if (isBaseUserDORequest(jsonBody)) {
            this.ensureIsInitialized(jsonBody);
        }
        else if (method === UserDOFetchMethod.sendMessageToUser && isSendMessageToUserRequest(jsonBody)) {
            logInfo("Message received", jsonBody);
        }
        else {
            throw new Error(`UserDO method must either be a ${UserDOFetchMethod.sendMessageToUser} or be a BaseUserDORequest`);
        }
        
        return [method,jsonBody];
    }

    assertUserHasWallet() {
        if (!this.wallet.value) {
            throw new Error("User has no wallet");
        }
    }

    async makeUserData(telegramUserID : number, forceRefreshBalance : boolean) : Promise<UserData> {
        const hasInviteBetaCodes = await this.getHasBetaCodes();
        const hasWallet = !!(this.wallet.value);
        const address = this.wallet.value?.publicKey;
        const maybeSOLBalance = await this.solBalanceTracker.maybeGetBalance(address, forceRefreshBalance, this.env);
        const maybePNL = this.openPositions.maybeGetUserPnL();
        return {
            hasWallet: hasWallet,
            address : address,
            initialized: this.initialized(),
            hasInviteBetaCodes: hasInviteBetaCodes,
            maybeSOLBalance : maybeSOLBalance,
            maybePNL: maybePNL
        };
    }

    private async getHasBetaCodes() {
        const isBetaInviteCodeGated = strictParseBoolean(this.env.IS_BETA_CODE_GATED);
        if (isBetaInviteCodeGated) {
            const betaCodes = await listUnclaimedBetaInviteCodes({ userID : this.telegramUserID.value!! }, this.env)
            if (betaCodes.success) {
                return betaCodes.data.betaInviteCodes.length > 0;
            }
        }
        return false;
    }
}