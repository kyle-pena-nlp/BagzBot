import { DurableObjectState } from "@cloudflare/workers-types";
import { Wallet, encryptPrivateKey, generateEd25519Keypair } from "../../crypto";
import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import { logError } from "../../logging";
import { PositionPreRequest, PositionStatus, PositionType } from "../../positions";
import { getSOLBalance } from "../../rpc/rpc_wallet";
import { POSITION_REQUEST_STORAGE_KEY } from "../../storage_keys";
import { WEN_ADDRESS, getVsTokenInfo } from "../../tokens";
import { ChangeTrackedValue, Structural, assertNever, groupIntoMap, makeFailureResponse, makeJSONResponse, makeSuccessResponse, maybeGetJson, strictParseBoolean } from "../../util";
import { listUnclaimedBetaInviteCodes } from "../beta_invite_codes/beta_invite_code_interop";
import { AutomaticallyClosePositionsRequest, AutomaticallyClosePositionsResponse } from "../token_pair_position_tracker/actions/automatically_close_positions";
import { wakeUpTokenPairPositionTracker } from "../token_pair_position_tracker/token_pair_position_tracker_DO_interop";
import { BaseUserDORequest } from "./actions/base_user_do_request";
import { DeleteSessionRequest, DeleteSessionResponse } from "./actions/delete_session";
import { GetAddressBookEntryRequest, GetAddressBookEntryResponse } from "./actions/get_address_book_entry";
import { GetImpersonatedUserIDRequest, GetImpersonatedUserIDResponse } from "./actions/get_impersonated_user_id";
import { GetLegalAgreementStatusRequest, GetLegalAgreementStatusResponse } from "./actions/get_legal_agreement_status";
import { GetPositionRequest } from "./actions/get_position";
import { GetSessionValuesRequest, GetSessionValuesWithPrefixRequest, GetSessionValuesWithPrefixResponse } from "./actions/get_session_values";
import { GetUserDataRequest } from "./actions/get_user_data";
import { GetWalletDataRequest, GetWalletDataResponse } from "./actions/get_wallet_data";
import { ImpersonateUserRequest, ImpersonateUserResponse } from "./actions/impersonate_user";
import { ListAddressBookEntriesRequest, ListAddressBookEntriesResponse } from "./actions/list_address_book_entries";
import { ListPositionsRequest } from "./actions/list_positions";
import { ManuallyClosePositionRequest, ManuallyClosePositionResponse } from "./actions/manually_close_position";
import { OpenPositionRequest, OpenPositionResponse } from "./actions/open_new_position";
import { RemoveAddressBookEntryRequest, RemoveAddressBookEntryResponse } from "./actions/remove_address_book_entry";
import { DefaultTrailingStopLossRequestRequest, DefaultTrailingStopLossRequestResponse } from "./actions/request_default_position_request";
import { StoreAddressBookEntryRequest, StoreAddressBookEntryResponse } from "./actions/store_address_book_entry";
import { StoreLegalAgreementStatusRequest, StoreLegalAgreementStatusResponse } from "./actions/store_legal_agreement_status";
import { StoreSessionValuesRequest, StoreSessionValuesResponse } from "./actions/store_session_values";
import { UnimpersonateUserRequest, UnimpersonateUserResponse } from "./actions/unimpersonate_user";
import { UserInitializeRequest, UserInitializeResponse } from "./actions/user_initialize";
import { UserData } from "./model/user_data";
import { AddressBookEntryTracker } from "./trackers/address_book_entry_tracker";
import { SessionTracker } from "./trackers/session_tracker";
import { SOLBalanceTracker } from "./trackers/sol_balance_tracker";
import { UserPositionTracker } from "./trackers/user_position_tracker";
import { UserDOFetchMethod, parseUserDOFetchMethod } from "./userDO_interop";
import { buy } from "./user_buy";
import { sell } from "./user_sell";

// TODO: all requests to UserDo include telegramUserID and telegramUserName
// and ensure initialization.  That way, no purpose-specific initialization call is required

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
    retrySellIfSlippageExceeded : true            
};

/* Durable Object storing state of user */
export class UserDO {

    // boilerplate DO stuff
    env : Env;
    state: DurableObjectState;
    loadFromStorageFailed : boolean|undefined = undefined

    // user's ID
    telegramUserID : ChangeTrackedValue<number|null> = new ChangeTrackedValue<number|null>('telegramUserID', null);

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

    // tracks the positions currently open (or closing but not confirmed closed) for this user
    userPositionTracker : UserPositionTracker = new UserPositionTracker();

    // tracks the address book entries to which the user can send funds
    addressBookEntryTracker : AddressBookEntryTracker = new AddressBookEntryTracker();

    // has the user signed legal?
    legalAgreementStatus : ChangeTrackedValue<'agreed'|'refused'|'has-not-responded'> = new ChangeTrackedValue<'agreed'|'refused'|'has-not-responded'>('hasSignedLegal', 'has-not-responded');

    constructor(state : DurableObjectState, env : any) {
        // persistent state object which reaches eventual consistency
        this.env                = env;
        this.state              = state;
        // TODO: allow user to update defaults in 'Options' menu
        
        this.state.blockConcurrencyWhile(async () => {
            await this.loadStateFromStorage();
        });
        this.wakeUpPositionTrackers();
    }

    async wakeUpPositionTrackers() {
        const positions = this.userPositionTracker.listPositions();
        const map = groupIntoMap(positions, p => `${p.token.address}~${p.vsToken.address}`);
        for (const [key,positions] of map) {
            const tokenAddress = positions[0].token.address;
            const vsTokenAddress = positions[0].vsToken.address;
            wakeUpTokenPairPositionTracker(tokenAddress, vsTokenAddress, this.env);
        }
    }

    async loadStateFromStorage() {
        const storage = await this.state.storage.list();
        this.wallet.initialize(storage);
        this.telegramUserID.initialize(storage);
        this.impersonatedUserID.initialize(storage);
        this.sessionTracker.initialize(storage);
        this.userPositionTracker.initialize(storage);
        this.addressBookEntryTracker.initialize(storage);
        this.solBalanceTracker.initialize(storage); // rate limits RPC calls. will refresh on access.
        this.legalAgreementStatus.initialize(storage);
        this.defaultTrailingStopLossRequest.initialize(storage);
    }

    async flushToStorage() {
        await Promise.allSettled([
            this.telegramUserID.flushToStorage(this.state.storage),
            this.impersonatedUserID.flushToStorage(this.state.storage),
            this.wallet.flushToStorage(this.state.storage),
            this.sessionTracker.flushToStorage(this.state.storage),
            this.userPositionTracker.flushToStorage(this.state.storage),
            this.addressBookEntryTracker.flushToStorage(this.state.storage),
            this.solBalanceTracker.flushToStorage(this.state.storage),
            this.legalAgreementStatus.flushToStorage(this.state.storage),
            this.defaultTrailingStopLossRequest.flushToStorage(this.state.storage)
        ]);
    }

    initialized() : boolean {
        return (this.telegramUserID.value != null);
    }

    async fetch(request : Request) : Promise<Response> {
        try {
            const [method,jsonRequestBody,response] = await this._fetch(request);
            return response;
        }
        catch(e) {
            logError("Error in userDO fetch", e, this.telegramUserID);
            return makeSuccessResponse();
        }
        finally {
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
    }

    async _fetch(request : Request) : Promise<[UserDOFetchMethod,any,Response]> {

        const [method,userRequest] = await this.validateFetchRequest(request);
        let response : Response|null = null;

        await this.ensureIsInitialized(userRequest);

        // it's ugly but better than a complicated type setup or a bunch of casts
        const userAction = userRequest as any;

        switch(method) {
            case UserDOFetchMethod.get:
                response = await this.handleGet(userAction);            
                break;
            case UserDOFetchMethod.initialize:
                response = await this.handleInitialize(userAction);            
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
            case UserDOFetchMethod.getPosition:
                this.assertUserHasWallet();
                response = await this.handleGetPosition(userAction);
                break;
            case UserDOFetchMethod.listPositions:
                this.assertUserHasWallet();
                response = await this.handleListPositions(userAction);
                break;
            case UserDOFetchMethod.manuallyClosePosition:
                this.assertUserHasWallet();
                response = await this.handleManuallyClosePositionRequest(userAction);
                break;
            case UserDOFetchMethod.automaticallyClosePositions:
                this.assertUserHasWallet();
                response = await this.handleAutomaticallyClosePositionsRequest(userAction);
                break;
            case UserDOFetchMethod.storeAddressBookEntry:
                response = await this.handleStoreAddressBookEntry(userAction);
                break;
            case UserDOFetchMethod.listAddressBookEntries:
                response = await this.handleListAddressBookEntries(userAction);
                break;
            case UserDOFetchMethod.removeAddressBookEntry:
                response = await this.handleRemoveAddressBookEntry(userAction);
                break;
            case UserDOFetchMethod.getAddressBookEntry:
                response = await this.handleGetAddressBookEntry(userAction);
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
            default:
                assertNever(method);
        }

        return [method,userAction,response];
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

    async handleRemoveAddressBookEntry(request : RemoveAddressBookEntryRequest) : Promise<Response> {
        const response = this._handleRemoveAddressBookEntry(request);
        return makeJSONResponse<RemoveAddressBookEntryResponse>(response);
    }

    _handleRemoveAddressBookEntry(request : RemoveAddressBookEntryRequest) : RemoveAddressBookEntryResponse {
        this.addressBookEntryTracker.delete(request.addressBookEntryID);
        return {};
    }

    async handleGetAddressBookEntry(request : GetAddressBookEntryRequest) : Promise<Response> {
        const response = this._handleGetAddressBookEntry(request);
        return makeJSONResponse<GetAddressBookEntryResponse>(response);
    }

    _handleGetAddressBookEntry(request : GetAddressBookEntryRequest) : GetAddressBookEntryResponse {
        const addressBookEntry = this.addressBookEntryTracker.get(request.addressBookEntryID);
        return { addressBookEntry : addressBookEntry };
    }

    async handleStoreAddressBookEntry(request : StoreAddressBookEntryRequest) : Promise<Response> {
        const response = await this._handleStoreAddressBookEntry(request);
        return makeJSONResponse<StoreAddressBookEntryResponse>(response);
    }

    private async _handleStoreAddressBookEntry(request : StoreAddressBookEntryRequest) : Promise<StoreAddressBookEntryResponse> {
        const entry = request.addressBookEntry;
        const maybeEntryWithSameName = this.addressBookEntryTracker.getByName(entry.name)
        if (maybeEntryWithSameName != null) {
            return {
                success: false,
                friendlyMessage: `An address book entry with that name already exists: <code>(${maybeEntryWithSameName.address})</code>`
            }
        }
        const maybeEntrySameAddress = this.addressBookEntryTracker.getByAddress(entry.address);
        if (maybeEntrySameAddress != null) {
            return {
                success: false,
                friendlyMessage: `An address book entry with that address already exists: (${maybeEntrySameAddress.name})`
            }
        }
        this.addressBookEntryTracker.set(entry.addressBookEntryID,entry);
        return {
            success: true
        }
    }

    handleListAddressBookEntries(request : ListAddressBookEntriesRequest) : Response {
        const response = this._handleListAddressBookEntries(request);
        return makeJSONResponse<ListAddressBookEntriesResponse>(response);
    }

    private _handleListAddressBookEntries(request : ListAddressBookEntriesRequest) : ListAddressBookEntriesResponse {
        const addressBookEntries = [...this.addressBookEntryTracker.values()];
        const response : ListAddressBookEntriesResponse = { addressBookEntries: addressBookEntries };
        return response;
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

    async handleListPositions(request : ListPositionsRequest) : Promise<Response> {
        const positions = this.userPositionTracker.listPositions();
        return makeJSONResponse(positions);
    }

    /* Handles any exceptions and turns them into failure responses - fine because UserDO doesn't talk directly to TG */
    async catchResponse(promise : Promise<Response>) : Promise<Response> {
        return promise.catch((reason) => {
            return makeFailureResponse(reason.toString());
        });
    }

    async handleGetPosition(getPositionRequest: GetPositionRequest) {
        const position = this.userPositionTracker.getPosition(getPositionRequest.positionID);
        return makeJSONResponse(position);
    }

    async handleGet(jsonRequestBody : GetUserDataRequest) : Promise<Response> {
        const messageID = jsonRequestBody.messageID;
        const forceRefreshSOLBalance = jsonRequestBody.forceRefreshBalance;
        return makeJSONResponse(await this.makeUserData(forceRefreshSOLBalance));
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

    async handleInitialize(userInitializeRequest : UserInitializeRequest) : Promise<Response> {
        if (this.initialized()) {
            return makeSuccessResponse("User already initialized");
        }
        this.telegramUserID.value = userInitializeRequest.telegramUserID;
        return makeJSONResponse<UserInitializeResponse>({});
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
        // fire and forget (async callback will handle success and failure cases for swap)
        const positionRequest = openPositionRequest.positionRequest;       
        /*
            This is deliberately not awaited.
            Durable Objects will continue processing requests for up to 30 seconds
            (Which means the buy has to happen in 30 secs!!!)
        */
        buy(positionRequest, this.wallet.value!!, this.userPositionTracker, this.env);
        return makeJSONResponse<OpenPositionResponse>({});
    }
    
    async handleManuallyClosePositionRequest(manuallyClosePositionRequest : ManuallyClosePositionRequest) : Promise<Response> {
        
        const positionID = manuallyClosePositionRequest.positionID;
        const position = this.userPositionTracker.getPosition(positionID);
        if (position == null) {
            return makeJSONResponse<ManuallyClosePositionResponse>({ message: 'Position does not exist.' });
        }
        else if (position.status === PositionStatus.Closing) {
            return makeJSONResponse<ManuallyClosePositionResponse>({ message: 'Position are being closed.' });
        }
        else if (position.status === PositionStatus.Closed) {
            return makeJSONResponse<ManuallyClosePositionResponse>({ message: 'Position already closed.' });
        }
        await sell(position.positionID, this.wallet.value!!, this.userPositionTracker, this.env);
        return makeJSONResponse<ManuallyClosePositionResponse>({ message: 'Position will now be closed. '});
    }

    async handleAutomaticallyClosePositionsRequest(closePositionsRequest : AutomaticallyClosePositionsRequest) : Promise<Response> {
        const positions = closePositionsRequest.positions;
        for (const position of positions) {

            // before we sell, we verify the position is still active
            const userTrackedPosition = this.userPositionTracker.getPosition(position.positionID);
            
            // if it's already gone, don't try to re-sell it
            if (userTrackedPosition == null) {
                continue;
            } 

            // if it's already in the process of being sold, don't try to re-sell it
            if (userTrackedPosition.status === PositionStatus.Closing) {
                continue;
            }

            // if it's already sold, don't try to re-sell it
            if (position.status === PositionStatus.Closed) {
                continue;
            }

            // TODO: handle unconfirmed status.

            // otherwise, try to sell it.
            sell(position.positionID, this.wallet.value!!, this.userPositionTracker, this.env);
        }
        return makeJSONResponse<AutomaticallyClosePositionsResponse>({});
    }

    async validateFetchRequest(request : Request) : Promise<[UserDOFetchMethod,BaseUserDORequest]> {
        const jsonBody : any = await maybeGetJson(request);
        if (!('telegramUserID' in jsonBody)) {
            throw new Error("All requests to UserDO must include telegramUserID");
        }
        const methodName = new URL(request.url).pathname.substring(1);
        const method : UserDOFetchMethod|null = parseUserDOFetchMethod(methodName);
        if (method == null) {
            throw new Error(`Unknown method ${method}`);
        }
        return [method,jsonBody];
    }

    assertUserIsNotInitialized() {
        if (this.initialized()) {
            throw new Error("User is already initialized");
        }
    }

    assertUserIsInitialized() {
        if (!this.initialized()) {
            throw new Error("User is not initialized");
        }
    }

    assertUserHasNoWallet() {
        if (this.wallet.value) {
            throw new Error("User already has wallet");
        }
    }

    assertUserHasWallet() {
        if (!this.wallet.value) {
            throw new Error("User has no wallet");
        }
    }

    async makeUserData(forceRefreshBalance : boolean) : Promise<UserData> {
        const hasInviteBetaCodes = await this.getHasBetaCodes();
        const hasWallet = !!(this.wallet.value);
        const address = this.wallet.value?.publicKey;
        const maybeSOLBalance = await this.solBalanceTracker.maybeGetBalance(address, forceRefreshBalance, this.env);

        return {
            hasWallet: hasWallet,
            address : address,
            initialized: this.initialized(),
            hasInviteBetaCodes: hasInviteBetaCodes,
            maybeSOLBalance : maybeSOLBalance
        };
    }

    private async maybeGetSOLBalance(forceRefreshSOLBalance : boolean) : Promise<DecimalizedAmount|undefined> {
        const wallet = this.wallet.value;
        if (wallet == null) {
            return;
        }
        const solLamportsBalance = await getSOLBalance(wallet.publicKey, this.env).catch(r => undefined);
        if (solLamportsBalance == null) {
            return;
        }
        return {
            tokenAmount : solLamportsBalance.toString(),
            decimals: getVsTokenInfo('SOL').decimals
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