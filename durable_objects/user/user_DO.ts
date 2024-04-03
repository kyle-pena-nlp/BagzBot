import { Connection } from "@solana/web3.js";
import { isAdminOrSuperAdmin } from "../../admins";
import { Wallet, encryptPrivateKey, generateEd25519Keypair } from "../../crypto";
import { asTokenPrice } from "../../decimalized/decimalized_amount";
import { Env, getRPCUrl } from "../../env";
import { logDebug, logError, logInfo } from "../../logging";
import { PositionPreRequest, PositionStatus, PositionType } from "../../positions";
import { POSITION_REQUEST_STORAGE_KEY } from "../../storage_keys";
import { TGStatusMessage, UpdateableNotification, sendMessageToTG } from "../../telegram";
import { WEN_ADDRESS, getVsTokenInfo } from "../../tokens";
import { ChangeTrackedValue, Structural, assertNever, groupIntoBatches, makeFailureResponse, makeJSONResponse, makeSuccessResponse, maybeGetJson, setDifference, sleep, strictParseBoolean } from "../../util";
import { assertIs } from "../../util/enums";
import { listUnclaimedBetaInviteCodes } from "../beta_invite_codes/beta_invite_code_interop";
import { PositionAndMaybePNL } from "../token_pair_position_tracker/model/position_and_PNL";
import { _adminDeleteAll, editTriggerPercentOnOpenPositionInTracker, getPositionAndMaybePNL, listPositionsByUser, setSellAutoDoubleOnOpenPositionInPositionTracker } from "../token_pair_position_tracker/token_pair_position_tracker_do_interop";
import { AdminDeleteAllPositionsRequest, AdminDeleteAllPositionsResponse } from "./actions/admin_delete_all_positions";
import { AutomaticallyClosePositionsRequest, AutomaticallyClosePositionsResponse } from "./actions/automatically_close_positions";
import { BaseUserDORequest, isBaseUserDORequest } from "./actions/base_user_do_request";
import { DeleteSessionRequest, DeleteSessionResponse } from "./actions/delete_session";
import { EditTriggerPercentOnOpenPositionRequest, EditTriggerPercentOnOpenPositionResponse } from "./actions/edit_trigger_percent_on_open_position";
import { GetImpersonatedUserIDRequest, GetImpersonatedUserIDResponse } from "./actions/get_impersonated_user_id";
import { GetLegalAgreementStatusRequest, GetLegalAgreementStatusResponse } from "./actions/get_legal_agreement_status";
import { GetPositionFromUserDORequest, GetPositionFromUserDOResponse } from "./actions/get_position_from_user_do";
import { GetSessionValuesRequest, GetSessionValuesWithPrefixRequest, GetSessionValuesWithPrefixResponse } from "./actions/get_session_values";
import { GetUserDataRequest } from "./actions/get_user_data";
import { GetWalletDataRequest, GetWalletDataResponse } from "./actions/get_wallet_data";
import { ImpersonateUserRequest, ImpersonateUserResponse } from "./actions/impersonate_user";
import { ListPositionsFromUserDORequest, ListPositionsFromUserDOResponse } from "./actions/list_positions_from_user_do";
import { ManuallyClosePositionRequest, ManuallyClosePositionResponse } from "./actions/manually_close_position";
import { OpenPositionRequest, OpenPositionResponse } from "./actions/open_new_position";
import { DefaultTrailingStopLossRequestRequest, DefaultTrailingStopLossRequestResponse } from "./actions/request_default_position_request";
import { SendMessageToUserRequest, SendMessageToUserResponse, isSendMessageToUserRequest } from "./actions/send_message_to_user";
import { SetSellAutoDoubleOnOpenPositionRequest, SetSellAutoDoubleOnOpenPositionResponse } from "./actions/set_sell_auto_double_on_open_position";
import { StoreLegalAgreementStatusRequest, StoreLegalAgreementStatusResponse } from "./actions/store_legal_agreement_status";
import { StoreSessionValuesRequest, StoreSessionValuesResponse } from "./actions/store_session_values";
import { UnimpersonateUserRequest, UnimpersonateUserResponse } from "./actions/unimpersonate_user";
import { TokenPair } from "./model/token_pair";
import { UserData } from "./model/user_data";
import { PositionBuyer } from "./position_buyer";
import { PositionSeller } from "./position_seller";
import { SessionTracker } from "./trackers/session_tracker";
import { SOLBalanceTracker } from "./trackers/sol_balance_tracker";
import { TokenPairsForPositionIDsTracker } from "./trackers/token_pairs_for_position_ids_tracker";
import { UserPNLTracker } from "./trackers/user_pnl_tracker";
import { UserDOFetchMethod, parseUserDOFetchMethod } from "./userDO_interop";
import { publishFinalSellMessage } from "./user_sell_message";

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
    sellAutoDoubleSlippage : true            
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
    
    // stores just the positionID / tokenAddress / vsTokenAddress
    tokenPairsForPositionIDsTracker : TokenPairsForPositionIDsTracker = new TokenPairsForPositionIDsTracker();

    userPNLTracker : UserPNLTracker = new UserPNLTracker();

    inbox: { from : string, message : string }[] = [];
    // TODO: way to make arrays compatible with ChangeTrackedValue?
    //inbox : ChangeTrackedValue<string[]> = new ChangeTrackedValue<string[]>("inbox", []);

    // I'm using this to have UserDOs self-schedule alarms as long as they have any positions
    // That way, an 'incoming request' happens every 10s, allowing the CPU limit to reset to 30s
    // This allows for longer-running processes.
    isAlarming : boolean = false;

    constructor(state : DurableObjectState, env : any) {
        this.env                = env;
        this.state              = state;
        this.state.blockConcurrencyWhile(async () => {
            await this.loadStateFromStorage();
        });
    }

    async loadStateFromStorage() {
        const storage = await this.state.storage.list();
        this.wallet.initialize(storage);
        this.telegramUserID.initialize(storage);
        this.impersonatedUserID.initialize(storage);
        this.sessionTracker.initialize(storage);
        this.solBalanceTracker.initialize(storage); // rate limits RPC calls. will refresh on access.
        this.legalAgreementStatus.initialize(storage);
        this.defaultTrailingStopLossRequest.initialize(storage);
        this.tokenPairsForPositionIDsTracker.initialize(storage);
        this.userPNLTracker.initialize(storage);
        this.chatID.initialize(storage);
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
            this.tokenPairsForPositionIDsTracker.flushToStorage(this.state.storage),
            this.userPNLTracker.flushToStorage(this.state.storage),
            this.chatID.flushToStorage(this.state.storage)
        ]);
    }

    async alarm() {
        logDebug(`Invoking alarm for ${this.telegramUserID.value}`);
        try {
            await this.state.storage.deleteAlarm();
            await this.maybeScheduleAlarm();
        }
        catch {
            logError(`Problem rescheduling alarm for ${this.telegramUserID.value}`);
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
            await this.state.storage.setAlarm(Date.now() + 10000);
        }
        else {
            this.isAlarming = false;
        }
    }

    shouldScheduleNextAlarm() {
        return this.tokenPairsForPositionIDsTracker.any();
    }

    initialized() : boolean {
        return (this.telegramUserID.value != null);
    }

    async fetch(request : Request) : Promise<Response> {
        try {
            const [method,jsonRequestBody,response] = await this._fetch(request);
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
        // if initialization was attempted and the wallet was not initialized...
        if (this.wallet.initializationAttempted && !this.wallet.initialized) {
            this.wallet.value = await this.generateWallet();
        }

        // set most recent chat ID.
        if (userAction.chatID > 0) {
            this.chatID.value = userAction.chatID;
        }
    }

    async _fetch(request : Request) : Promise<[UserDOFetchMethod,any,Response]> {

        const [method,userAction] = await this.validateFetchRequest(request);
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
                response = await this.handleOpenNewPosition(userAction);
                break;
            case UserDOFetchMethod.manuallyClosePosition:
                this.assertUserHasWallet();
                response = await this.handleManuallyClosePositionRequest(userAction);
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
            default:
                assertNever(method);
        }

        return [method,userAction,response];
    }

    async handleAdminDeleteAllPositions(userAction : AdminDeleteAllPositionsRequest) : Promise<Response> {
        const result = this.handleAdminDeleteAllPositionsInternal(userAction);
        return makeJSONResponse<AdminDeleteAllPositionsResponse>(result);
    }

    async handleAdminDeleteAllPositionsInternal(userAction : AdminDeleteAllPositionsRequest) : Promise<AdminDeleteAllPositionsResponse> {
        const realUserID = userAction.realTelegramUserID;
        const userID = userAction.telegramUserID;
        if (!isAdminOrSuperAdmin(realUserID, this.env)) {
            logError(`Only admin user can delete all positions - was ${realUserID}`);
            return {};
        }
        const uniquePairs = this.tokenPairsForPositionIDsTracker.listUniqueTokenPairs();
        for (const pair of uniquePairs) {
            await _adminDeleteAll(realUserID, pair.tokenAddress, pair.vsTokenAddress, this.env);
        }

        return {};
        
        /*const positions = await this.listPositionsFromUserDO(userID);
        for (const posAndMaybePNL of positions) {
            const position = posAndMaybePNL.position;
            logInfo(`Removing position with ID ${position.positionID}`);
            await removePosition(position.positionID, position.token.address, position.vsToken.address, this.env);
        }
        return {};*/
    }

    private async handleSetSellAutoDoubleOnOpenPositionRequest(userAction : SetSellAutoDoubleOnOpenPositionRequest) : Promise<Response> {
        const response = this.handleSetSellAutoDoubleOnOpenPositionRequestInternal(userAction);
        return makeJSONResponse<SetSellAutoDoubleOnOpenPositionResponse>(response);
    }

    private async handleSetSellAutoDoubleOnOpenPositionRequestInternal(userAction: SetSellAutoDoubleOnOpenPositionRequest) : Promise<SetSellAutoDoubleOnOpenPositionResponse> {
        const positionID = userAction.positionID;
        const tokenPair = this.tokenPairsForPositionIDsTracker.getPositionPair(positionID);
        if (tokenPair == null) {
            return {};
        }
        const tokenAddress = tokenPair.token.address;
        const vsTokenAddress = tokenPair.vsToken.address;
        const choice = userAction.choice;
        return await setSellAutoDoubleOnOpenPositionInPositionTracker(positionID, tokenAddress, vsTokenAddress, choice, this.env);
    }

    async handleEditTriggerPercentOnOpenPosition(request: EditTriggerPercentOnOpenPositionRequest) : Promise<Response> {
        const response = await this.handleEditTriggerPercentOnOpenPositionInternal(request);
        return makeJSONResponse<EditTriggerPercentOnOpenPositionResponse>(response);
    }

    async handleEditTriggerPercentOnOpenPositionInternal(request : EditTriggerPercentOnOpenPositionRequest) : Promise<EditTriggerPercentOnOpenPositionResponse> {
        const positionID = request.positionID;
        const tokenPair = this.tokenPairsForPositionIDsTracker.getPositionPair(positionID);
        if (tokenPair == null) {
            throw new Error(`Unable to find TokenPair when editing trigger percent on open position with ID ${positionID}`);
        }
        const tokenAddress = tokenPair.token.address;
        const vsTokenAddress = tokenPair.vsToken.address;
        const percent = request.percent;
        if (percent <= 0 || percent >= 100) {
            return 'invalid-percent';
        }
        const response = await editTriggerPercentOnOpenPositionInTracker(positionID, tokenAddress, vsTokenAddress, percent, this.env);
        return response;
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
            const messageWithContext = `${this.env.TELEGRAM_BOT_INSTANCE_DISPLAY_NAME} :: '${message.from}' says: "${message.message}"`;
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
        const positionID = request.positionID;
        const tokenPair = this.tokenPairsForPositionIDsTracker.getPositionPair(positionID);
        let position : PositionAndMaybePNL|undefined = undefined;
        if (tokenPair != null) {
            const tokenAddress = tokenPair.token.address;
            const vsTokenAddress = tokenPair.vsToken.address;
            position = await getPositionAndMaybePNL(positionID, tokenAddress, vsTokenAddress, this.env);
        }
        const response : GetPositionFromUserDOResponse = { position : position };
        return makeJSONResponse(response);
    }

    async handleListPositionsFromUserDO(request : ListPositionsFromUserDORequest) : Promise<Response> {
        const userID = request.telegramUserID;
        const positions = await this.listPositionsFromUserDO(userID);
        const response : ListPositionsFromUserDOResponse = { positions: positions };
        return makeJSONResponse(response);
    }

    async listPositionsFromUserDO(userID : number) : Promise<PositionAndMaybePNL[]> {

        // fetch positions from all relevant trackers
        const uniqueTokenPairs : TokenPair[] = this.tokenPairsForPositionIDsTracker.listUniqueTokenPairs();
        const positions : PositionAndMaybePNL[]  = [];
        for (const tokenPair of uniqueTokenPairs) {
            const positionsForTokenPair = await listPositionsByUser(userID, tokenPair.tokenAddress, tokenPair.vsTokenAddress, this.env);
            positions.push(...positionsForTokenPair);
        }

        // the tracker is the source of truth.  if the userDO has a token pair for a position that doesn't exist in the tracker, remove it
        const currentPositionIDs = new Set<string>(positions.map(p => p.position.positionID));
        const positionIDsInTracker = new Set<string>(this.tokenPairsForPositionIDsTracker.listPositionIDs());
        const deletedPositionIDs = setDifference(positionIDsInTracker, currentPositionIDs, Set<string>);
        this.tokenPairsForPositionIDsTracker.removePositions([...deletedPositionIDs]);

        // likewise, if for whatever reason the pair for this position is missing, this would rectify it
        for (const position of positions) {
            this.tokenPairsForPositionIDsTracker.storePosition({
                positionID: position.position.positionID,
                token : { address : position.position.token.address },
                vsToken : { address : position.position.vsToken.address }
            });
        }
        // if on the other hand, a position has disappeared from the tracker, remove it.

        return positions;
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

    // TODO: a less hacky/dangerous way to do this.
    maybeWriteToDefaultPositionPrerequest(sessionKey : string, value : any) {
        // MAJOR hack to avoid large code change
        if (sessionKey.startsWith(POSITION_REQUEST_STORAGE_KEY)) {
            const sessionProperty = sessionKey.split("/")[1];
            const dont_store_these : (keyof PositionPreRequest)[] = [ 'userID', 'chatID', 'positionID', 'messageID', 'positionID' ];
            if (dont_store_these.includes(sessionProperty)) {
                return;
            }
            if (sessionProperty != null && sessionProperty in this.defaultTrailingStopLossRequest.value) {
                (this.defaultTrailingStopLossRequest.value as any)[sessionProperty] = value;
            }
            if (sessionProperty != null && sessionProperty === 'token') {
                const tokenAddress = (value as any)?.address;
                if (tokenAddress != null) {
                    (this.defaultTrailingStopLossRequest.value as any)['tokenAddress'] = tokenAddress;
                }      
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
        this.tokenPairsForPositionIDsTracker.storePosition({
            positionID: openPositionRequest.positionRequest.positionID,
            token: { address : openPositionRequest.positionRequest.token.address },
            vsToken: { address : openPositionRequest.positionRequest.vsToken.address }
        });


        // non-blocking notification channel to push update messages to TG
        const channel = TGStatusMessage.replaceWithNotification(
            positionRequest.messageID, 
            `Initiating swap...`, 
            false, 
            positionRequest.chatID, 
            this.env,
            'HTML',
            '<b>New Position</b>: ');        
        /*
            This is deliberately not awaited.
            Durable Objects will continue processing requests for up to 30 seconds
            (Which means the buy has to happen in 30 secs, or it is considered unconfirmed!!!)
        */
        const positionBuyer = new PositionBuyer(this.wallet.value!!, this.env, startTimeMS, channel);    
        positionBuyer.buy(positionRequest);
        return makeJSONResponse<OpenPositionResponse>({});
    }
    
    async handleManuallyClosePositionRequest(manuallyClosePositionRequest : ManuallyClosePositionRequest) : Promise<Response> {
        const startTimeMS = Date.now();
        const positionID = manuallyClosePositionRequest.positionID;
        const tokenPair = this.tokenPairsForPositionIDsTracker.getPositionPair(positionID);
        if (tokenPair == null) {
            logError(`Could not find tokenPair for position ID ${positionID}`, this.telegramUserID);
            return makeJSONResponse<ManuallyClosePositionResponse>({ message: 'Could not find token pair for position' });
        }
        const tokenAddress = tokenPair.token.address;
        const vsTokenAddress = tokenPair.vsToken.address;
        const positionAndMaybePNL = await getPositionAndMaybePNL(positionID, tokenAddress, vsTokenAddress, this.env);
        if (positionAndMaybePNL == null) {
            return makeJSONResponse<ManuallyClosePositionResponse>({ message: "Position did not exist" });
        }
        const position = positionAndMaybePNL.position;
        if (position.status == PositionStatus.Closing) {
            return makeJSONResponse<ManuallyClosePositionResponse>({ message: "Position is already being sold." });
        }
        else if (position.status === PositionStatus.Closed) {
            return makeJSONResponse<ManuallyClosePositionResponse>({ message: "Position has already been sold." });
        }
        assertIs<PositionStatus.Open,typeof position.status>();
        const channel = TGStatusMessage.createAndSend(`Initiating sale of ${asTokenPrice(position.tokenAmt)} ${position.token.symbol}`, false, position.chatID, this.env, 'HTML', '<b>Manual Sell</b>: ');
        // deliberate lack of await here (fire-and-forget). Must complete in 30s.
        const connection = new Connection(getRPCUrl(this.env));
        const positionSeller = new PositionSeller(connection, this.wallet.value!!, startTimeMS, channel, this.env);
        positionSeller.sell(position).then(sellStatus => publishFinalSellMessage(position, 'Sell', sellStatus, position.chatID, channel, this.env));
        return makeJSONResponse<ManuallyClosePositionResponse>({ message: 'Position will now be closed. '});
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
        let positionSeller : PositionSeller|null = null;
        for (const positionBatch of positionBatches) {
            // fire off a bunch of promises per batch (4)
            let sellPositionPromises = positionBatch.map(async position => {
                const channel = TGStatusMessage.createAndSend(`Initiating.`, false, this.chatID.value||0, this.env, 'HTML', '<b>Auto-Sell</b>: ');
                channels.push(channel);
                if (positionSeller == null) {
                    positionSeller = new PositionSeller(connection, this.wallet.value!!, startTimeMS, channel, this.env);
                }
                const sellPromise = positionSeller.sell(position).then(sellStatus => publishFinalSellMessage(position, 'Auto-sell', sellStatus, position.chatID, channel, this.env));
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
        const uniqueTokenPairs = this.tokenPairsForPositionIDsTracker.listUniqueTokenPairs();
        const maybePNL = await this.userPNLTracker.maybeGetPNL(telegramUserID, uniqueTokenPairs, forceRefreshBalance, this.env)
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