import { DurableObjectState } from "@cloudflare/workers-types";
import { Wallet, encryptPrivateKey, generateEd25519Keypair } from "../../crypto";
import { Env } from "../../env";
import { PositionPreRequest, PositionStatus, PositionType } from "../../positions";
import { getVsTokenInfo } from "../../tokens";
import { ChangeTrackedValue, Structural, assertNever, groupIntoMap, makeFailureResponse, makeJSONResponse, makeSuccessResponse, maybeGetJson, strictParseBoolean } from "../../util";
import { listUnclaimedBetaInviteCodes } from "../beta_invite_codes/beta_invite_code_interop";
import { AutomaticallyClosePositionsRequest, AutomaticallyClosePositionsResponse } from "../token_pair_position_tracker/actions/automatically_close_positions";
import { wakeUpTokenPairPositionTracker } from "../token_pair_position_tracker/token_pair_position_tracker_DO_interop";
import { DeleteSessionRequest, DeleteSessionResponse } from "./actions/delete_session";
import { GenerateWalletRequest, GenerateWalletResponse } from "./actions/generate_wallet";
import { GetAddressBookEntryRequest, GetAddressBookEntryResponse } from "./actions/get_address_book_entry";
import { GetPositionRequest } from "./actions/get_position";
import { GetSessionValuesRequest, GetSessionValuesWithPrefixRequest, GetSessionValuesWithPrefixResponse } from "./actions/get_session_values";
import { GetUserDataRequest } from "./actions/get_user_data";
import { GetWalletDataRequest, GetWalletDataResponse } from "./actions/get_wallet_data";
import { ListAddressBookEntriesRequest, ListAddressBookEntriesResponse } from "./actions/list_address_book_entries";
import { ListPositionsRequest } from "./actions/list_positions";
import { ManuallyClosePositionRequest, ManuallyClosePositionResponse } from "./actions/manually_close_position";
import { OpenPositionRequest, OpenPositionResponse } from "./actions/open_new_position";
import { RemoveAddressBookEntryRequest, RemoveAddressBookEntryResponse } from "./actions/remove_address_book_entry";
import { DefaultTrailingStopLossRequestRequest, DefaultTrailingStopLossRequestResponse } from "./actions/request_default_position_request";
import { StoreAddressBookEntryRequest, StoreAddressBookEntryResponse } from "./actions/store_address_book_entry";
import { StoreSessionValuesRequest, StoreSessionValuesResponse } from "./actions/store_session_values";
import { UserInitializeRequest, UserInitializeResponse } from "./actions/user_initialize";
import { UserData } from "./model/user_data";
import { AddressBookEntryTracker } from "./trackers/address_book_entry_tracker";
import { SessionTracker } from "./trackers/session_tracker";
import { UserPositionTracker } from "./trackers/user_position_tracker";
import { UserDOFetchMethod, parseUserDOFetchMethod } from "./userDO_interop";
import { buy } from "./user_buy";
import { sell } from "./user_sell";

// TODO: all requests to UserDo include telegramUserID and telegramUserName
// and ensure initialization.  That way, no purpose-specific initialization call is required

const WEN_ADDRESS = 'WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk';

/* Durable Object storing state of user */
export class UserDO {

    // boilerplate DO stuff
    env : Env;
    state: DurableObjectState;

    // user's ID
    telegramUserID : ChangeTrackedValue<number|null> = new ChangeTrackedValue<number|null>('telegramUserID', null);

    // user's name
    telegramUserName : ChangeTrackedValue<string|null> = new ChangeTrackedValue<string|null>('telegramUserName', null);

    // the user's wallet.
    wallet : ChangeTrackedValue<Wallet|null> = new ChangeTrackedValue<Wallet|null>('wallet', null);

    // the default values for a trailing sotp loss
    defaultTrailingStopLossRequest : PositionPreRequest;

    // tracks variable values associated with the current messageID
    sessionTracker : SessionTracker = new SessionTracker();

    // tracks the positions currently open (or closing but not confirmed closed) for this user
    userPositionTracker : UserPositionTracker = new UserPositionTracker();

    // tracks the address book entries to which the user can send funds
    addressBookEntryTracker : AddressBookEntryTracker = new AddressBookEntryTracker();

    constructor(state : DurableObjectState, env : any) {
        // persistent state object which reaches eventual consistency
        this.env                = env;
        this.state              = state;
        // TODO: allow user to update defaults in 'Options' menu
        this.defaultTrailingStopLossRequest = {
            userID: -1,
            chatID: -1,
            messageID: -1,
            positionID : "",
            positionType : PositionType.LongTrailingStopLoss,
            tokenAddress : WEN_ADDRESS, // to be subbed in
            vsToken : getVsTokenInfo('SOL'),
            vsTokenAmt : parseFloat(env.DEFAULT_TLS_VS_TOKEN_FRACTION),
            slippagePercent : 5.0,
            triggerPercent : 5,
            retrySellIfSlippageExceeded : true            
        };
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
        this.telegramUserID.initialize(storage);
        this.telegramUserName.initialize(storage);
        this.wallet.initialize(storage);
        this.sessionTracker.initialize(storage);
        this.userPositionTracker.initialize(storage);
        this.addressBookEntryTracker.initialize(storage);
    }

    async flushToStorage() {
        await Promise.allSettled([
            this.telegramUserID.flushToStorage(this.state.storage),
            this.telegramUserName.flushToStorage(this.state.storage),
            this.wallet.flushToStorage(this.state.storage),
            this.sessionTracker.flushToStorage(this.state.storage),
            this.userPositionTracker.flushToStorage(this.state.storage),
            this.addressBookEntryTracker.flushToStorage(this.state.storage)
        ]);
    }

    initialized() : boolean {
        return (this.telegramUserID.value != null) && (this.telegramUserName.value != null);
    }

    async fetch(request : Request) : Promise<Response> {
        try {
            const [method,jsonRequestBody,response] = await this._fetch(request);
            return response;
        }
        catch {
            return makeSuccessResponse();
        }
        finally {
            this.flushToStorage();
        }

    }

    async _fetch(request : Request) : Promise<[UserDOFetchMethod,any,Response]> {

        const [method,jsonRequestBody] = await this.validateFetchRequest(request);
        let response : Response|null = null;

        switch(method) {
            case UserDOFetchMethod.get:
                response = await this.handleGet(jsonRequestBody);            
                break;
            case UserDOFetchMethod.initialize:
                response = await this.handleInitialize(jsonRequestBody);            
                break;
            case UserDOFetchMethod.storeSessionValues:
                this.assertUserIsInitialized();
                response = await this.handleStoreSessionValues(jsonRequestBody);
                break;
            case UserDOFetchMethod.getSessionValues:
                this.assertUserIsInitialized();
                response = await this.handleGetSessionValues(jsonRequestBody);
                break;
            case UserDOFetchMethod.getSessionValuesWithPrefix:
                this.assertUserIsInitialized();
                response = this.handleGetSessionValuesWithPrefix(jsonRequestBody);
                break;
            case UserDOFetchMethod.getDefaultTrailingStopLossRequest:
                this.assertUserIsInitialized();
                response = this.handleGetDefaultTrailingStopLossRequest(jsonRequestBody);
                break;
            case UserDOFetchMethod.deleteSession:
                this.assertUserIsInitialized();
                response = await this.handleDeleteSession(jsonRequestBody);
                break;
            case UserDOFetchMethod.createWallet:
                this.assertUserIsInitialized();
                response = await this.handleGenerateWallet({});
                break;
            case UserDOFetchMethod.getWalletData:
                this.assertUserIsInitialized();
                this.assertUserHasWallet();
                response = await this.handleGetWalletData(jsonRequestBody);
                break;
            case UserDOFetchMethod.openNewPosition:
                this.assertUserIsInitialized();
                this.assertUserHasWallet();
                response = await this.handleOpenNewPosition(jsonRequestBody);
                break;
            case UserDOFetchMethod.getPosition:
                this.assertUserIsInitialized();
                this.assertUserHasWallet();
                response = await this.handleGetPosition(jsonRequestBody);
                break;
            case UserDOFetchMethod.listPositions:
                this.assertUserIsInitialized();
                this.assertUserHasWallet();
                response = await this.handleListPositions(jsonRequestBody);
                break;
            case UserDOFetchMethod.manuallyClosePosition:
                this.assertUserIsInitialized();
                this.assertUserHasWallet();
                response = await this.handleManuallyClosePositionRequest(jsonRequestBody);
                break;
            case UserDOFetchMethod.automaticallyClosePositions:
                this.assertUserIsInitialized();
                this.assertUserHasWallet();
                response = await this.handleAutomaticallyClosePositionsRequest(jsonRequestBody);
                break;
            case UserDOFetchMethod.storeAddressBookEntry:
                this.assertUserIsInitialized();
                response = await this.handleStoreAddressBookEntry(jsonRequestBody);
                break;
            case UserDOFetchMethod.listAddressBookEntries:
                this.assertUserIsInitialized();
                response = await this.handleListAddressBookEntries(jsonRequestBody);
                break;
            case UserDOFetchMethod.removeAddressBookEntry:
                this.assertUserIsInitialized();
                response = await this.handleRemoveAddressBookEntry(jsonRequestBody);
                break;
            case UserDOFetchMethod.getAddressBookEntry:
                this.assertUserIsInitialized();
                response = await this.handleGetAddressBookEntry(jsonRequestBody);
                break;
            default:
                assertNever(method);
        }

        return [method,jsonRequestBody,response];
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
        const defaultTrailingStopLossRequest = structuredClone(this.defaultTrailingStopLossRequest);
        defaultTrailingStopLossRequest.userID = defaultTrailingStopLossRequestRequest.userID;
        defaultTrailingStopLossRequest.chatID = defaultTrailingStopLossRequestRequest.chatID;
        defaultTrailingStopLossRequest.messageID = defaultTrailingStopLossRequestRequest.messageID;
        defaultTrailingStopLossRequest.positionID = crypto.randomUUID();
        defaultTrailingStopLossRequest.tokenAddress = defaultTrailingStopLossRequestRequest.token.address;
        const responseBody : DefaultTrailingStopLossRequestResponse = { prerequest: defaultTrailingStopLossRequest };
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
        return makeJSONResponse(await this.makeUserData(messageID));
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
        }
        return await this.sessionTracker.flushToStorage(this.state.storage).then(() => {
            return makeJSONResponse<StoreSessionValuesResponse>({});
        });
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
        this.telegramUserName.value = userInitializeRequest.telegramUserName;
        return makeJSONResponse<UserInitializeResponse>({});
    }

    async handleGenerateWallet(generateWalletRequest : GenerateWalletRequest) : Promise<Response> {
        if (!this.initialized()) {
            return makeJSONResponse<GenerateWalletResponse>({ success: false });
        }
        try {
            if (!this.wallet.value) {
                const { publicKey, privateKey } = await generateEd25519Keypair();
                this.wallet.value = {
                    telegramUserID: this.telegramUserID.value!!,
                    publicKey: publicKey,
                    encryptedPrivateKey: await encryptPrivateKey(privateKey, this.telegramUserID.value!!, this.env)
                };
            }
            return makeJSONResponse<GenerateWalletResponse>({ success: true });
        }
        catch {
            return makeJSONResponse<GenerateWalletResponse>({ success : false });
        }
        
    }

    async handleGetWalletData(request : GetWalletDataRequest) : Promise<Response> {
        return makeJSONResponse<GetWalletDataResponse>({
            wallet : this.wallet.value!!
        });
    }

    async handleOpenNewPosition(openPositionRequest : OpenPositionRequest) : Promise<Response> {
        // fire and forget (async callback will handle success and failure cases for swap)
        const positionRequest = openPositionRequest.positionRequest;       
        // deliberate fire-and-forget.  callbacks will handle state management.
        // TODO AM: store buyQuote on request.  Update when appropriate from menu.
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
        // deliberate fire-and-forget
        sell(position.positionID, this.wallet.value!!, this.userPositionTracker, this.env);
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

    async validateFetchRequest(request : Request) : Promise<[UserDOFetchMethod,any]> {
        const jsonBody : any = await maybeGetJson(request);
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

    async makeUserData(messageID : number) : Promise<UserData> {
        const hasInviteBetaCodes = await this.getHasBetaCodes();
        return {
            hasWallet: !!(this.wallet.value),
            initialized: this.initialized(),
            telegramUserName : this.telegramUserName.value||undefined,
            hasInviteBetaCodes: hasInviteBetaCodes
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