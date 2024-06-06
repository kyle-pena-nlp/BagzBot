import { Connection } from "@solana/web3.js";
import { isAdminOrSuperAdmin } from "../../admins";
import { Wallet, encryptPrivateKey, generateEd25519Keypair } from "../../crypto";
import { asTokenPrice } from "../../decimalized/decimalized_amount";
import { Env, allowChooseAutoDoubleSlippage, allowChoosePriorityFees, getRPCUrl } from "../../env";
import { makeFailureResponse, makeJSONResponse, makeSuccessResponse, maybeGetJson } from "../../http";
import { logDebug, logError, logInfo } from "../../logging";
import { PositionPreRequest, PositionRequest, PositionStatus, PositionType } from "../../positions";
import { POSITION_REQUEST_STORAGE_KEY } from "../../storage_keys";
import { TGStatusMessage, sendMessageToTG } from "../../telegram";
import { WEN_ADDRESS, getVsTokenInfo } from "../../tokens";
import { ChangeTrackedValue, Intersect, Structural, Subtract, assertNever, ensureArrayIsAllAndOnlyPropsOf, ensureArrayIsOnlyPropsOf, sleep, strictParseBoolean } from "../../util";
import { assertIs } from "../../util/enums";
import { listUnclaimedBetaInviteCodes } from "../beta_invite_codes/beta_invite_code_interop";
import { registerUser as registerUserWithHearbeat } from "../heartbeat/heartbeat_DO_interop";
import { GetTokenPriceResponse } from "../token_pair_position_tracker/actions/get_token_price";
import { PositionAndMaybePNL } from "../token_pair_position_tracker/model/position_and_PNL";
import { getTokenPrice } from "../token_pair_position_tracker/token_pair_position_tracker_DO_interop";
import { AdminDeleteAllPositionsRequest, AdminDeleteAllPositionsResponse } from "./actions/admin_delete_all_positions";
import { AdminDeleteClosedPositionsRequest } from "./actions/admin_delete_closed_positions";
import { AdminDeletePositionByIDRequest, AdminDeletePositionByIDResponse } from "./actions/admin_delete_position_by_id";
import { AdminGetInfoRequest, isAdminGetInfoRequest } from "./actions/admin_get_info";
import { AdminResetDefaultPositionRequest, AdminResetDefaultPositionResponse } from "./actions/admin_reset_default_position_request";
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
import { GetUserSettingsRequest, GetUserSettingsResponse } from "./actions/get_user_settings";
import { SetUserSettingsRequest, SetUserSettingsResponse } from "./actions/get_user_settings_request";
import { GetUserWalletSOLBalanceRequest, GetUserWalletSOLBalanceResponse } from "./actions/get_user_wallet_balance";
import { GetWalletDataRequest, GetWalletDataResponse } from "./actions/get_wallet_data";
import { ImpersonateUserRequest, ImpersonateUserResponse } from "./actions/impersonate_user";
import { ListDeactivatedPositionsRequest, ListDeactivatedPositionsResponse } from "./actions/list_frozen_positions";
import { ListPositionsFromUserDORequest, ListPositionsFromUserDOResponse } from "./actions/list_positions_from_user_do";
import { ManuallyClosePositionRequest, ManuallyClosePositionResponse } from "./actions/manually_close_position";
import { OpenPositionRequest, OpenPositionResponse } from "./actions/open_new_position";
import { ReactivatePositionRequest, ReactivatePositionResponse } from "./actions/reactivate_position";
import { RegisterPositionAsDeactivatedRequest, RegisterPositionAsDeactivatedResponse } from "./actions/register_position_as_deactivated";
import { DefaultTrailingStopLossRequestRequest, DefaultTrailingStopLossRequestResponse } from "./actions/request_default_position_request";
import { SendMessageToUserRequest, SendMessageToUserResponse, isSendMessageToUserRequest } from "./actions/send_message_to_user";
import { SetOpenPositionSellPriorityFeeMultiplierRequest, SetOpenPositionSellPriorityFeeMultiplierResponse } from "./actions/set_open_position_sell_priority_fee_multiplier";
import { SetSellAutoDoubleOnOpenPositionRequest, SetSellAutoDoubleOnOpenPositionResponse } from "./actions/set_sell_auto_double_on_open_position";
import { SellSellSlippagePercentageOnOpenPositionRequest, SellSellSlippagePercentageOnOpenPositionResponse } from "./actions/set_sell_slippage_percent_on_open_position";
import { StoreLegalAgreementStatusRequest, StoreLegalAgreementStatusResponse } from "./actions/store_legal_agreement_status";
import { StoreSessionValuesRequest, StoreSessionValuesResponse } from "./actions/store_session_values";
import { UnimpersonateUserRequest, UnimpersonateUserResponse } from "./actions/unimpersonate_user";
import { WakeUpRequest, WakeUpResponse } from "./actions/wake_up_request";
import { ClosedPositionPNLSummarizer } from "./aggregators/closed_positions_pnl_summarizer";
import { UserDOBuyConfirmer } from "./confirmers/user_do_buy_confirmer";
import { UserDOSellConfirmer } from "./confirmers/user_do_sell_confirmer";
import { AutomaticActions, AutomaticTask } from "./model/automatic_actions";
import { TokenPair } from "./model/token_pair";
import { UserData } from "./model/user_data";
import { UserSettings } from "./model/user_settings";
import { PositionBuyer, isPreparedBuyTx } from "./position_buyer";
import { PositionSeller, isPreparedSellTx } from "./position_seller";
import { ClosedPositionsTracker } from "./trackers/closed_positions_tracker";
import { DeactivatedPositionsTracker } from "./trackers/deactivated_positions_tracker";
import { OpenPositionsTracker } from "./trackers/open_positions_tracker";
import { SessionTracker } from "./trackers/session_tracker";
import { SOLBalanceTracker } from "./trackers/sol_balance_tracker";
import { UserSettingsTracker } from "./trackers/user_settings_tracker";
import { UserDOFetchMethod, parseUserDOFetchMethod } from "./userDO_interop";

type MIGRATION_FLAG = 'unmigrated'|'migrated_1';

const DEFAULT_POSITION_PREREQUEST : PositionPreRequest = {
    userID: -1,
    chatID: -1,
    messageID: -1,
    positionID : "",
    positionType : PositionType.LongTrailingStopLoss,
    tokenAddress : WEN_ADDRESS, // to be subbed in
    vsToken : getVsTokenInfo('SOL'),
    vsTokenAmt : 0.5,
    slippagePercent : 1.0,
    triggerPercent : 10,
    sellAutoDoubleSlippage : false,
    priorityFeeAutoMultiplier: 5, // TODO: set to 'auto' if feature flag on
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

    migrationFlag : ChangeTrackedValue<MIGRATION_FLAG> = new ChangeTrackedValue<MIGRATION_FLAG>("migration-flag", 'unmigrated');

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

    userSettingsTracker : UserSettingsTracker = new UserSettingsTracker();

    constructor(state : DurableObjectState, env : any) {
        this.env                = env;
        this.state              = state;
        this.state.blockConcurrencyWhile(async () => {
            await this.loadStateFromStorage();
            await this.maybePerformMigration();
        });
    }

    async maybePerformMigration() {
        if (this.migrationFlag.value === 'unmigrated') {
            this.defaultTrailingStopLossRequest.value = structuredClone(DEFAULT_POSITION_PREREQUEST);
            this.migrationFlag.value = 'migrated_1';
        }
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
        this.migrationFlag.initialize(storage);
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
            this.chatID.flushToStorage(this.state.storage),
            this.migrationFlag.flushToStorage(this.state.storage)
        ]);
    }

    async alarm() {  
        try {
            await this.state.storage.deleteAlarm();
            await this.performAlarmActions();
            await this.maybeScheduleAlarm();
        }
        catch (e : any) {
            logError(`Problem rescheduling alarm for ${this.telegramUserID.value}`, e.toString());
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
            if (!this.isAlarming) {
                logDebug(`Turning on alarm for ${this.telegramUserID.value}`);
            }
            this.isAlarming = true;
            await this.state.storage.setAlarm(Date.now() + 1000);
        }
        else {
            logDebug(`Turning off alarm for ${this.telegramUserID.value}`);
            this.isAlarming = false;
        }
    }

    shouldScheduleNextAlarm() {
        if (strictParseBoolean(this.env.DOWN_FOR_MAINTENANCE)) {
            return false;
        }
        return this.openPositions.listPositions({ includeClosing: true, includeOpen : true, includeUnconfirmed : true, includeClosed : false }).length > 0;
    }

    async getLatestPrice(tokenPair : TokenPair) : Promise<GetTokenPriceResponse> {
        const response = await getTokenPrice(tokenPair.tokenAddress, tokenPair.vsTokenAddress, this.env);
        return response;
    }

    async performAlarmActions() {

        // gather automatic actions to perform
        const startTimeMS = Date.now();
        const tokenPairs = this.openPositions.listUniqueTokenPairs({ includeOpen: true, includeUnconfirmed : true, includeClosing : true, includeClosed : false });
        const automaticActions = new AutomaticActions();
        for (const tokenPair of tokenPairs) {
            const getTokenPriceResult = await this.getLatestPrice(tokenPair);
            if (getTokenPriceResult.price != null)  {
                automaticActions.update(this.openPositions.updatePrice({ 
                    tokenPair, 
                    price: getTokenPriceResult.price, 
                    currentPriceMS: getTokenPriceResult.currentPriceMS,
                    markTriggeredAsClosing: true,
                    markUnconfirmedBuysAsConfirming : true,
                    markUnconfirmedSellsAsConfirming : true 
                }, this.env));
            }
            else {
                logError("Unable to retrieve price", tokenPair);
            }
        }

        // turn them into a task list
        const tasks = automaticActions.getTasks();

        // if there are no tasks to be done, early out
        if (tasks.length === 0) {
            return;
        }

        // put the rest of them back in a not-executing state so they can be picked up next go-around
        for (const task of tasks.slice(1)) {
            this.undoPendingProcessingState(task)
        }

        // execute just the first one (next will be picked up again next time)
        await this.performAutomaticAction(tasks[0], startTimeMS);
    }

    private undoPendingProcessingState(task : AutomaticTask) {
        if (task.type === 'automatic-sell') {
            this.openPositions.mutatePosition(task.positionID, p => {
                p.status = PositionStatus.Open;
                p.txSellAttemptTimeMS = 0;
            });
        }
        else if (task.type === 'confirm-buy') {
            this.openPositions.mutatePosition(task.positionID, p => {
                p.buyConfirming = false;
            });
        }
        else if (task.type === 'confirm-sell') {
            this.openPositions.mutatePosition(task.positionID, p => {
                p.sellConfirming = false;
            });
        }
    }

    private async performAutomaticAction(task : AutomaticTask, startTimeMS : number) {
        switch(task.type) {
            case 'automatic-sell':
                await this.performAutomaticSell(task.positionID, startTimeMS);
            case 'confirm-buy':
                await this.performConfirmBuy(task.positionID, startTimeMS);
            case 'confirm-sell':
                await this.performConfirmSell(task.positionID, startTimeMS);
                break;
            default:
                assertNever(task.type);
        }
    }

    
    private async performAutomaticSell(positionID : string, startTimeMS : number) {
        
        // double check it's still eligible for automatic sell, since we just entered an async
        const position = this.openPositions.get(positionID);
        if (position == null || position.status !== PositionStatus.Closing || !position.buyConfirmed) {
            return;
        }
        
        const channel = TGStatusMessage.createAndSend(`Initiating sale.`, false, position.chatID, this.env, 'HTML', `<a href="${position.token.logoURI}">\u200B</a><b>Automatic Sale of ${asTokenPrice(position.tokenAmt)} ${position.token.symbol}</b>: `);
        const connection = new Connection(getRPCUrl(this.env));
        const positionSeller = new PositionSeller(connection, this.wallet.value!!, 'auto-sell', startTimeMS, channel, this.env, this.openPositions, this.closedPositions, this.deactivatedPositions);
    
        const preparedSellTx = await positionSeller.prepareAndSimTx(position.positionID);
        if (isPreparedSellTx(preparedSellTx)) {
            // deliberate fire-and-forget, with flushToStorage guaranteed in 'finally'
            positionSeller.executeTx(positionID, preparedSellTx)
                .then(async status => await positionSeller.finalize(positionID, status))
                .catch(async r => await positionSeller.finalize(positionID, 'unexpected-failure'))
                .then(() => this.invalidateWalletBalanceCache())
                .finally(async () => await this.flushToStorage());
        }
        else {
            await positionSeller.finalize(positionID, preparedSellTx);
        }
    }

    private async performConfirmBuy(positionID : string, startTimeMS : number) {

        // double check it's still eligible for buy confirmation, since we just entered an async
        const position = this.openPositions.get(positionID);
        if (position == null || position.status !== PositionStatus.Open || position.buyConfirmed || !position.buyConfirming) {
            return;
        }

        const unconfirmedPosition = this.openPositions.get(positionID)!!;
        const buyConfirmPrefix = `:notify: <b>Attempting to confirm your earlier purchase of ${asTokenPrice(unconfirmedPosition.tokenAmt)} ${unconfirmedPosition.token.symbol}</b>: `;
        const channel = TGStatusMessage.createAndSend('In progress...', false, unconfirmedPosition.chatID, this.env, 'HTML', buyConfirmPrefix);   
        const connection = new Connection(getRPCUrl(this.env));
        const buyConfirmer = new UserDOBuyConfirmer(channel, connection, startTimeMS, this.env, this.openPositions, this.closedPositions, this.deactivatedPositions);
        
        // deliberate fire-and-forget
        buyConfirmer.maybeConfirmBuy(positionID)
            .then(async status => await buyConfirmer.finalize(positionID, status))
            .catch(async r => await buyConfirmer.handleUnexpectedFailure(positionID, r))
            .then(() => this.invalidateWalletBalanceCache())
            .finally(async () => {
                await this.flushToStorage();
            });
    }

    private async performConfirmSell(positionID : string, startTimeMS : number) {

        // double check it's still eligible for sell confirmation, since we just entered an async
        const position = this.openPositions.get(positionID);
        if (position == null || position.status !== PositionStatus.Closing || !position.sellConfirming) {
            return;
        }

        const pos = this.openPositions.get(positionID)!!;
        const sellConfirmPrefix = `:notify: <b>Attempting to confirm the earlier sale of ${asTokenPrice(pos.tokenAmt)} $${pos.token.symbol}</b>: `;
        const channel = TGStatusMessage.createAndSend('In progress...', false, pos.chatID, this.env, 'HTML', sellConfirmPrefix);
        const connection = new Connection(getRPCUrl(this.env));
        const sellConfirmer = new UserDOSellConfirmer(channel, connection, startTimeMS, this.env, this.openPositions, this.closedPositions, this.deactivatedPositions);
        
        // deliberate fire-and-forget
        sellConfirmer.maybeConfirmSell(positionID)
            .then(async status => await sellConfirmer.finalize(positionID, status))
            .catch(async r => await sellConfirmer.handleUnexpectedFailure(positionID, r))
            .then(() => this.invalidateWalletBalanceCache())
            .finally(async () => {
                this.flushToStorage();
            });
    }

    initialized() : boolean {
        return (this.telegramUserID.value != null);
    }

    async fetch(request : Request) : Promise<Response> {
        try {
            const [method,jsonRequestBody,response] = await this._fetch(request);
            await this.maybeStartAlarming().catch(r => {
                logError(`Problem with maybe scheduling alarm for UserDO ${this.telegramUserID.value}`)
                return null;
            });
            return response;
        }
        catch(e : any) {
            logError("Error in userDO fetch", e.toString(), this.telegramUserID);
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

    async _fetch(request : Request) : Promise<[UserDOFetchMethod,any,Response]> {

        const [method,userAction] = await this.validateFetchRequest(request);

        logDebug(`[[${method}]] :: user_DO :: ${this.telegramUserID.value}`);

        let response : Response|null = null;

        switch(method) {
            case UserDOFetchMethod.adminGetInfo:
                response = await this.handleAdminGetInfo(userAction);
                break;
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
                response = await this.handleOpenNewPosition(userAction);
                break;
            case UserDOFetchMethod.manuallyClosePosition:
                this.assertUserHasWallet();
                response = await this.handleManuallyClosePositionRequest(userAction);
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
            case UserDOFetchMethod.registerPositionAsDeactivated:
                response = await this.handleRegisterPositionAsDeactivated(userAction);
                break;
            case UserDOFetchMethod.wakeUp:
                response = await this.handleWakeUp(userAction);
                break;
            case UserDOFetchMethod.getUserSettings:
                response = await this.handleGetUserSettings(userAction);
                break;
            case UserDOFetchMethod.setUserSettings:
                response = await this.setUserSettings(userAction);
                break;
            default:
                assertNever(method);
        }

        return [method,userAction,response];
    }

    async setUserSettings(userAction : SetUserSettingsRequest) : Promise<Response> {
        const changes = userAction.changes;
        if (changes.quickBuyEnabled != null) {
            this.userSettingsTracker.quickBuyEnabled.value = changes.quickBuyEnabled;
        }
        if (changes.quickBuyPriorityFee !=  null) {
            this.userSettingsTracker.quickBuyPriorityFee.value = changes.quickBuyPriorityFee;
        }
        if (changes.quickBuySOLAmount != null) {
            this.userSettingsTracker.quickBuySOLAmount.value = changes.quickBuySOLAmount;
        }
        if (changes.quickBuySlippagePct != null) {
            this.userSettingsTracker.quickBuySlippagePct.value = changes.quickBuySlippagePct;
        }
        if (changes.quickBuyTSLTriggerPct != null) {
            this.userSettingsTracker.quickBuyTSLTriggerPct.value = changes.quickBuyTSLTriggerPct;
        }
        if (changes.quickBuyAutoDoubleSlippage != null) {
            this.userSettingsTracker.quickBuyAutoDoubleSlippage.value = changes.quickBuyAutoDoubleSlippage;
        }
        const userSettings  = this.getUserSettings();
        return makeJSONResponse<SetUserSettingsResponse>({ userSettings : userSettings });
    }

    async handleGetUserSettings(userAction : GetUserSettingsRequest) : Promise<Response> {
        const userSettings = this.getUserSettings();
        return makeJSONResponse<GetUserSettingsResponse>({ userSettings: userSettings });
    }

    private getUserSettings() : UserSettings {
        const userSettings : UserSettings = {
            quickBuyEnabled: this.userSettingsTracker.quickBuyEnabled.value,
            quickBuyPriorityFee: this.userSettingsTracker.quickBuyPriorityFee.value||'auto',
            quickBuySlippagePct: this.userSettingsTracker.quickBuySlippagePct.value||1.0,
            quickBuySOLAmount: this.userSettingsTracker.quickBuySOLAmount.value||0.05,
            quickBuyTSLTriggerPct: this.userSettingsTracker.quickBuyTSLTriggerPct.value||10,
            quickBuyAutoDoubleSlippage: this.userSettingsTracker.quickBuyAutoDoubleSlippage.value||false
        };
        return userSettings;
    }

    async handleAdminGetInfo(userAction: AdminGetInfoRequest): Promise<Response> {
        if (this.telegramUserID.value == null) {
            return makeJSONResponse({ msg: "Not initialized" });
        }
        const positions = this.openPositions.listPositions({ includeClosed: false, includeClosing: true, includeOpen: true, includeUnconfirmed: true });
        const adminInfo = {
            telegramUserID: this.telegramUserID.value,
            chatID : this.chatID.value,
            posCount: positions.length
        };
        return makeJSONResponse(adminInfo);
    }


    async handleWakeUp(userAction : WakeUpRequest) : Promise<Response> {
        const keepInWakeUpList = this.openPositions.listPositions({ includeClosed: false, includeClosing: true, includeOpen: true, includeUnconfirmed: true }).length > 0;
        return makeJSONResponse<WakeUpResponse>({ keepInWakeUpList: keepInWakeUpList });
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
            const tokenPriceResult = await getTokenPrice(position.token.address, position.vsToken.address, this.env);
            if (tokenPriceResult.price == null) {
                return { success : false };
            }
            this.openPositions.reactivatePosition(position, tokenPriceResult.price, tokenPriceResult.currentPriceMS);
            this.deactivatedPositions.deleteAndReturn(position.positionID);
            registerUserWithHearbeat(userAction.telegramUserID, userAction.chatID, this.env);
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
        this.openPositions.mutateOpenConfirmedPosition(request.positionID, (position) => {
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

    async handleOpenNewPosition(openPositionRequest : OpenPositionRequest) : Promise<Response> {
        const startTimeMS = Date.now();
        const positionRequest = openPositionRequest.positionRequest;
        const positionID = positionRequest.positionID;

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
        
        // this is awaited so that we are certain to flush the new position to storage no matter how long the tx takes
        const preparedTx = await positionBuyer.prepareTx(positionRequest);

        if (isPreparedBuyTx(preparedTx)) {
            // deliberate fire-and-forget here, lack of await, but writes to storage when complete
            positionBuyer.executeTx(positionRequest, preparedTx)
                .then(async status => await positionBuyer.finalizeChannel(positionID, status))
                .catch(async r => await positionBuyer.finalizeChannel(positionID, 'failed'))
                .then(() => this.invalidateWalletBalanceCache())
                .finally(async () => await this.flushToStorage());
        }
        else {
            positionBuyer.finalizeChannel(positionID, preparedTx);
        }
        
        return makeJSONResponse<OpenPositionResponse>({});
    }

    async handleManuallyClosePositionRequest(manuallyClosePositionRequest : ManuallyClosePositionRequest) : Promise<Response> {
        const response = await this.handleManuallyClosePositionRequestInternal(manuallyClosePositionRequest);
        return makeJSONResponse<ManuallyClosePositionResponse>(response);
    }
    
    async handleManuallyClosePositionRequestInternal(manuallyClosePositionRequest : ManuallyClosePositionRequest) : Promise<ManuallyClosePositionResponse> {
        const startTimeMS = Date.now();
        const result = await this.manuallyClosePosition(manuallyClosePositionRequest.positionID, startTimeMS);
        if (result.success === false) {
            return result;
        }
        // This may seem weird, but really we have to wait until later for the sale to be confirmed.
        return { success: null, reason: 'attempting-sale' };
    }

    async manuallyClosePosition(positionID  : string, startTimeMS : number) : Promise<{ success: false, reason: 'position-DNE'|'position-closing'|'position-closed'|'buy-unconfirmed' }|{ success: null, reason: 'attempting-sale' }> {
        
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

        // this prevents against race conditions / double selling
        // TODO: make a set of methods that encapsulated these "locks" for auto sells, manual sells, etc.
        this.openPositions.mutatePosition(positionID, p => {
            p.status = PositionStatus.Closing;
            p.txSellAttemptTimeMS = Date.now();
        });

        assertIs<PositionStatus.Open,typeof position.status>();
        const channel = TGStatusMessage.createAndSend(`Initiating sale.`, false, position.chatID, this.env, 'HTML', `<a href="${position.token.logoURI}">\u200B</a><b>Manual Sale of ${asTokenPrice(position.tokenAmt)} ${position.token.symbol}</b>: `);
        const connection = new Connection(getRPCUrl(this.env));
        const positionSeller = new PositionSeller(connection, this.wallet.value!!, 'manual-sell', startTimeMS, channel, this.env, this.openPositions, this.closedPositions, this.deactivatedPositions);

        const preparedSellTx = await positionSeller.prepareAndSimTx(position.positionID);

        if (isPreparedSellTx(preparedSellTx)) {
            // deliberate fire-and-forget, with flushToStorage guaranteed in 'finally'
            positionSeller.executeTx(positionID, preparedSellTx)
                .then(async status => await positionSeller.finalize(positionID, status))
                .catch(async r => await positionSeller.finalize(positionID, 'unexpected-failure'))
                .then(() => this.invalidateWalletBalanceCache())
                .finally(async () => await this.flushToStorage());
        }
        else {
            await positionSeller.finalize(positionID, preparedSellTx);
        }

        // success is indeterminate (by design) (explanation: depends on what happens with the positionSeller.sell, which is unawaited, so we don't know the result yet, hence 'null')
        return { success: null, reason: 'attempting-sale' };
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
        else if (isAdminGetInfoRequest(jsonBody)) {
            logInfo("Get admin get info request");
        }
        else {
            throw new Error(`UserDO method must either be a ${UserDOFetchMethod.sendMessageToUser} or ${UserDOFetchMethod.adminGetInfo} or be a BaseUserDORequest`);
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

    invalidateWalletBalanceCache() {
        this.solBalanceTracker.lastRefreshedSOLBalance = 0;
    }
}