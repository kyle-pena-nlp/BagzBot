import { DurableObjectState } from "@cloudflare/workers-types";
import { ChangeTrackedValue } from "../../util/change_tracked_value";
import { UserData } from "./model/user_data";
import { ManuallyClosePositionRequest, ManuallyClosePositionResponse } from "./actions/manually_close_position";
import { UserInitializeRequest, UserInitializeResponse } from "./actions/user_initialize";
import { GetUserDataRequest } from "./actions/get_user_data";
import { DeleteSessionRequest, DeleteSessionResponse } from "./actions/delete_session";
import { StoreSessionValuesRequest, StoreSessionValuesResponse } from "./actions/store_session_values";
import { GetSessionValuesRequest  } from "./actions/get_session_values";
import { GetSessionValuesWithPrefixRequest, GetSessionValuesWithPrefixResponse } from "./actions/get_session_values";
import { AutomaticallyClosePositionsRequest, AutomaticallyClosePositionsResponse } from "../token_pair_position_tracker/actions/automatically_close_positions";
import { DefaultTrailingStopLossRequestRequest } from "./actions/request_default_position_request";
import { Structural } from "../../util/structural";
import { OpenPositionRequest, OpenPositionResponse } from "./actions/open_new_position";
import { makeSuccessResponse, makeJSONResponse, makeFailureResponse, maybeGetJson } from "../../util/http_helpers";
import { SessionTracker } from "./trackers/session_tracker";
import { UserPositionTracker } from "./trackers/user_position_tracker";
import { generateEd25519Keypair } from "../../crypto/cryptography";
import { UserDOFetchMethod, parseUserDOFetchMethod } from "./userDO_interop";
import { TokenPairPositionTrackerDOFetchMethod, makeTokenPairPositionTrackerDOFetchRequest, markPositionAsClosedInTokenPairPositionTracker, markPositionAsClosingInTokenPairPositionTracker } from "../token_pair_position_tracker/token_pair_position_tracker_DO_interop";
import { getVsTokenInfo } from "../../tokens/vs_tokens";
import { Env } from "../../env";
import { Wallet } from "../../crypto/wallet";
import { GenerateWalletRequest, GenerateWalletResponse } from "./actions/generate_wallet";
import { PositionRequest, PositionType, PositionStatus } from "../../positions/positions";
import { TokenInfo } from "../../tokens/token_info";
import { ListPositionsRequest } from "./actions/list_positions";
import { TokenPairPositionTrackerInitializeRequest } from "../token_pair_position_tracker/actions/initialize_token_pair_position_tracker";
import { GetPositionRequest } from "./actions/get_position";
import { GetWalletDataRequest, GetWalletDataResponse } from "./actions/get_wallet_data";
import { buy } from "./user_buy";
import { sell } from "./user_sell";

/* Durable Object storing state of user */
export class UserDO {

    // boilerplate DO stuff
    env : Env
    state: DurableObjectState;

    // user's ID
    telegramUserID : ChangeTrackedValue<number|null> = new ChangeTrackedValue<number|null>('telegramUserID', null);

    // user's name
    telegramUserName : ChangeTrackedValue<string|null> = new ChangeTrackedValue<string|null>('telegramUserName', null);

    // the user's wallet.  TODO: encrypt private keys
    wallet : ChangeTrackedValue<Wallet|null> = new ChangeTrackedValue<Wallet|null>('wallet', null);

    // the default values for a trailing sotp loss
    defaultTrailingStopLossRequest : PositionRequest;

    // tracks variable values associated with the current messageID
    sessionTracker : SessionTracker = new SessionTracker();

    // tracks the positions currently open (or closing but not confirmed closed) for this user
    userPositionTracker : UserPositionTracker = new UserPositionTracker();

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
            token : getVsTokenInfo('USDC')!!,
            vsToken : getVsTokenInfo('SOL')!!,
            vsTokenAmt : parseFloat(env.DEFAULT_TLS_VS_TOKEN_FRACTION),
            slippagePercent : 2.0,
            triggerPercent : 5,
            retrySellIfSlippageExceeded : true            
        };
        this.state.blockConcurrencyWhile(async () => {
            await this.initializeFromPersistence();
        });
    }

    async initializeFromPersistence() {
        const storage = await this.state.storage.list();
        this.telegramUserID.initialize(storage);
        this.telegramUserName.initialize(storage);
        this.wallet.initialize(storage);
        this.sessionTracker.initialize(storage);
        this.userPositionTracker.initialize(storage);
    }

    async flushToStorage() {
        await Promise.allSettled([
            this.telegramUserID.flushToStorage(this.state.storage),
            this.telegramUserName.flushToStorage(this.state.storage),
            this.wallet.flushToStorage(this.state.storage),
            this.sessionTracker.flushToStorage(this.state.storage),
            this.userPositionTracker.flushToStorage(this.state.storage)
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
                response = await this.handleInitialize(jsonRequestBody)            
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
            default:
                response = makeFailureResponse('Unknown method: ${method.toString()}');
        }

        return [method,jsonRequestBody,response];
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

    handleGetDefaultTrailingStopLossRequest(defaultTrailingStopLossRequestRequest : DefaultTrailingStopLossRequestRequest) {
        const defaultTrailingStopLossRequest = structuredClone(this.defaultTrailingStopLossRequest);
        defaultTrailingStopLossRequest.userID = defaultTrailingStopLossRequestRequest.userID;
        defaultTrailingStopLossRequest.chatID = defaultTrailingStopLossRequestRequest.chatID;
        defaultTrailingStopLossRequest.messageID = defaultTrailingStopLossRequestRequest.messageID;
        defaultTrailingStopLossRequest.positionID = crypto.randomUUID();
        defaultTrailingStopLossRequest.token = defaultTrailingStopLossRequestRequest.token;
        const responseBody = defaultTrailingStopLossRequest;
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
        return makeJSONResponse(this.makeUserData(messageID));
    }

    async handleDeleteSession(jsonRequestBody : DeleteSessionRequest) : Promise<Response> {
        const messageID = jsonRequestBody.messageID;
        this.sessionTracker.deleteSession(messageID);
        return await this.sessionTracker.flushToStorage(this.state.storage).then(() => {
            return makeJSONResponse<DeleteSessionResponse>({});
        })
    }

    async handleStoreSessionValues(jsonRequestBody : StoreSessionValuesRequest) : Promise<Response> {
        const messageID = jsonRequestBody.messageID;
        for (const sessionKey of Object.keys(jsonRequestBody.sessionValues)) {
            const value = jsonRequestBody.sessionValues[sessionKey];
            this.sessionTracker.storeSessionValue(messageID, sessionKey, value);
        }
        return await this.sessionTracker.flushToStorage(this.state.storage).then(() => {
            return makeJSONResponse<StoreSessionValuesResponse>({});
        })
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
        if (!this.wallet.value) {
            const { publicKey, privateKey } = await generateEd25519Keypair();
            this.wallet.value = {
                publicKey: publicKey,
                privateKey: privateKey
            };
        }
        return makeJSONResponse<GenerateWalletResponse>({ success: true });
    }

    async handleGetWalletData(request : GetWalletDataRequest) : Promise<Response> {
        return makeJSONResponse<GetWalletDataResponse>({
            address : this.wallet.value!!.publicKey
        });
    }

    async handleOpenNewPosition(openPositionRequest : OpenPositionRequest) : Promise<Response> {
        // fire and forget (async callback will handle success and failure cases for swap)
        const positionRequest = openPositionRequest.positionRequest;       
        // deliberate fire-and-forget.  callbacks will handle state management.
        buy(positionRequest, this.wallet.value!!, this.userPositionTracker, this.env);
        return makeJSONResponse<OpenPositionResponse>({});
    }

    async ensureTokenPairPositionTrackerDOIsInitialized(token : TokenInfo, vsToken : TokenInfo, tokenPairPositionTrackerDO : DurableObjectStub) : Promise<void> {
        const body: TokenPairPositionTrackerInitializeRequest = {
            token : token,
            vsToken : vsToken
        };
        const request = makeTokenPairPositionTrackerDOFetchRequest(TokenPairPositionTrackerDOFetchMethod.initialize, body);
        return await tokenPairPositionTrackerDO.fetch(request).then((response) => {
            if (!response.ok) {
                throw new Error("Could not initialize tokenPairPositionTrackerDO");
            }
            else {
                return;
            }
        });
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
        sell(position, this.wallet.value!!, this.userPositionTracker, this.env);
        return makeJSONResponse<ManuallyClosePositionResponse>({ message: 'Position will now be closed. '});
    }

    async handleAutomaticallyClosePositionsRequest(closePositionsRequest : AutomaticallyClosePositionsRequest) : Promise<Response> {
        const positions = closePositionsRequest.positions;
        for (const position of positions) {
            // fire and forget.  callbacks will handle state changes / user notifications.
            if (position.status === PositionStatus.Closing) {
                continue;
            }
            else if (position.status === PositionStatus.Closed) {
                continue;
            }
            sell(position, this.wallet.value!!, this.userPositionTracker, this.env);
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

    makeUserData(messageID : number) : UserData {
        
        const session = this.sessionTracker.getSessionValues(messageID);
        return {
            hasWallet: !!(this.wallet.value),
            initialized: this.initialized(),
            telegramUserName : this.telegramUserName.value||undefined,
            session: session
        };
    }
}