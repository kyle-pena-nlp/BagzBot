import { DurableObjectState } from "@cloudflare/workers-types";
import { UserData } from "./model/user_data";
import { ManuallyClosePositionRequest, ManuallyClosePositionResponse } from "./actions/manually_close_position";
import { UserInitializeRequest, UserInitializeResponse } from "./actions/user_initialize";
import { GetUserDataRequest } from "./actions/get_user_data";
import { DeleteSessionRequest, DeleteSessionResponse } from "./actions/delete_session";
import { StoreSessionValuesRequest, StoreSessionValuesResponse } from "./actions/store_session_values";
import { GetSessionValuesRequest, SessionValuesResponse} from "./actions/get_session_values";
import { GetSessionValuesWithPrefixRequest, GetSessionValuesWithPrefixResponse } from "./actions/get_session_values";
import { AutomaticallyClosePositionsRequest, AutomaticallyClosePositionsResponse } from "../token_pair_position_tracker/actions/automatically_close_positions";
import { DefaultTrailingStopLossRequestRequest } from "./actions/request_default_position_request";
import { SessionValue } from "./model/session";
import { OpenPositionRequest, OpenPositionResponse } from "./actions/open_new_position";
import { makeSuccessResponse, makeJSONResponse, makeFailureResponse, maybeGetJson } from "../../util/http_helpers";
import { SessionTracker } from "./trackers/session_tracker";
import { UserPositionTracker } from "./trackers/user_position_tracker";
import { generateEd25519Keypair } from "../../crypto/cryptography";
import { UserDOFetchMethod, parseUserDOFetchMethod } from "./userDO_interop";
import { TokenPairPositionTrackerDOFetchMethod, importNewPosition, makeTokenPairPositionTrackerDOFetchRequest, markPositionAsClosedInTokenPairPositionTracker, markPositionAsClosingInTokenPairPositionTracker } from "../token_pair_position_tracker/token_pair_position_tracker_DO_interop";
import { sellTokenAndParseSwapTransaction, buyTokenAndParseSwapTransaction, SwapResult, isTransactionPreparationFailure, isTransactionExecutionFailure, isTransactionParseFailure, isSwapExecutionError, isRetryableTransactionParseFailure, SuccessfulSwapSummary } from "../../rpc/rpc_interop";
import { getVsTokenInfo } from "../../tokens/vs_tokens";
import { Env } from "../../env";
import { Wallet } from "../../crypto/wallet";
import { GenerateWalletRequest, GenerateWalletResponse } from "./actions/generate_wallet";
import { PositionRequest, Position, PositionType, PositionStatus } from "../../positions/positions";
import { TokenInfo } from "../../tokens/token_info";
import { ListPositionsRequest } from "./actions/list_positions";
import { TokenPairPositionTrackerInitializeRequest } from "../token_pair_position_tracker/actions/initialize_token_pair_position_tracker";
import { GetPositionRequest } from "./actions/get_position";
import { sendMessageToTG } from "../../telegram/telegram_helpers";
import { expBackoff } from "../../util/exp_backoff";
import { getTokenInfo } from "../polled_token_pair_list/polled_token_pair_list_DO_interop";
import { ImportNewPositionsResponse } from "../token_pair_position_tracker/actions/import_new_positions";
import { MarkPositionAsClosedRequest } from "../token_pair_position_tracker/actions/mark_position_as_closed";
import { MarkPositionAsClosingRequest } from "../token_pair_position_tracker/actions/mark_position_as_closing";
import { GetWalletDataRequest, GetWalletDataResponse } from "./actions/get_wallet_data";

/* Durable Object storing state of user */
export class UserDO {

    // boilerplate DO stuff
    env : Env
    state: DurableObjectState;

    // user's ID
    telegramUserID : number|null;

    // user's name
    telegramUserName : string|null;

    // the user's wallet.  TODO: encrypt private keys
    wallet : Wallet|null;

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
        this.telegramUserID     = null;
        this.telegramUserName   = null;
        this.wallet             = null;
        // TODO: allow user to update defaults in 'Options' menu
        this.defaultTrailingStopLossRequest = {
            userID: -1,
            chatID: -1,
            positionID : "",
            type : PositionType.LongTrailingStopLoss,
            token : getVsTokenInfo('USDC')!!,
            tokenAddress : "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            vsToken : getVsTokenInfo('SOL')!!,
            vsTokenAddress : "So11111111111111111111111111111111111111112",
            vsTokenAmt : parseFloat(env.DEFAULT_TLS_VS_TOKEN_FRACTION),
            slippagePercent : 0.5,
            triggerPercent : 5,
            retrySellIfSlippageExceeded : true            
        };
        this.state.blockConcurrencyWhile(async () => {
            await this.initializeFromPersistence();
        });
    }

    async initializeFromPersistence() {
        const storage = await this.state.storage.list();
        for (const key of storage.keys()) {
            switch(key) {
                case 'telegramUserID':
                    this.telegramUserID = storage.get(key) as number|null;
                    break;
                case 'telegramUserName':
                    this.telegramUserName = storage.get(key) as string|null;
                    break;
                case 'wallet':
                    this.wallet = storage.get(key) as Wallet|null;
                    break;
            }
        }
        this.sessionTracker.initialize(storage);
        this.userPositionTracker.initialize(storage);
    }

    initialized() : boolean {
        return (this.telegramUserID != null) && (this.telegramUserName != null);
    }

    async fetch(request : Request) : Promise<Response> {
        const [method,jsonRequestBody,response] = await this._fetch(request);
        return response;
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
        const sessionValues : Record<string,SessionValue> = {};
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
        this.telegramUserID = userInitializeRequest.telegramUserID;
        this.telegramUserName = userInitializeRequest.telegramUserName;
        return await this.state.storage.put({ 
            "telegramUserID": this.telegramUserID, 
            "telegramUserName": this.telegramUserName 
        }).then(() => {
            return makeJSONResponse<UserInitializeResponse>({});
        });
    }

    async handleGenerateWallet(generateWalletRequest : GenerateWalletRequest) : Promise<Response> {
        if (!this.wallet) {
            const { publicKey, privateKey } = await generateEd25519Keypair();
            this.wallet = {
                publicKey: publicKey,
                privateKey: privateKey
            };
            return await this.state.storage.put("wallet",this.wallet).then(() => {
                return makeJSONResponse<GenerateWalletResponse>({ success: true });
            }).catch(() => {
                return makeJSONResponse<GenerateWalletResponse>({ success: false });
            });
        }
        return makeJSONResponse<GenerateWalletResponse>({ success: true });
    }

    async handleGetWalletData(request : GetWalletDataRequest) : Promise<Response> {
        return makeJSONResponse<GetWalletDataResponse>({
            address : this.wallet!!.publicKey
        });
    }

    async handleOpenNewPosition(openPositionRequest : OpenPositionRequest) : Promise<Response> {
        // fire and forget (async callback will handle success and failure cases for swap)
        const positionRequest = openPositionRequest.positionRequest;
        const chatID = openPositionRequest.chatID;
        const tokenInfo = (await getTokenInfo(positionRequest.tokenAddress, this.env)).tokenInfo!!;        
        // deliberate fire-and-forget.  callbacks will handle state management.
        buyTokenAndParseSwapTransaction(positionRequest, this.wallet!!, this.env)
            .then(swapResult => this.buySwapCallback(positionRequest, swapResult, tokenInfo, chatID));
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
            return makeSuccessResponse();
        }
        this.userPositionTracker.setAsClosing(positionID);
        const markPositionAsClosingRequest : MarkPositionAsClosingRequest = {
            positionID : positionID,
            tokenAddress : position.token.address,
            vsTokenAddress : position.vsToken.address
        };
        markPositionAsClosingInTokenPairPositionTracker(markPositionAsClosingRequest, this.env);
        // deliberate fire-and-forget.  callbacks will handle state changes.
        sellTokenAndParseSwapTransaction(position, this.wallet!!, this.env)
            .then((swapResult) => this.sellSwapCallback(swapResult, position));
        return makeJSONResponse<ManuallyClosePositionResponse>({});
    }

    async handleAutomaticallyClosePositionsRequest(closePositionsRequest : AutomaticallyClosePositionsRequest) : Promise<Response> {
        const positions = closePositionsRequest.positions;
        for (const position of positions) {
            // fire and forget.  callbacks will handle state changes / user notifications.
            sellTokenAndParseSwapTransaction(position, this.wallet!!, this.env)
                .then((swapResult) => this.sellSwapCallback(swapResult, position));

        }
        return makeJSONResponse<AutomaticallyClosePositionsResponse>({});
    }

    async handleOpenPositionRequest(positionRequestRequest: OpenPositionRequest) : Promise<Response> {

        // fire and forget.  callbacks will handle state changes / user notifications.
        const positionRequest = positionRequestRequest.positionRequest;
        const tokenInfo = (await getTokenInfo(positionRequest.tokenAddress, this.env)).tokenInfo!!;
        buyTokenAndParseSwapTransaction(positionRequest, this.wallet!!, this.env)
            .then((swapResult) => this.buySwapCallback(positionRequest, swapResult, tokenInfo, positionRequest.chatID));
        return makeJSONResponse<OpenPositionResponse>({});
    }

    // this is the callback from executing a sell
    async sellSwapCallback(swapResult : SwapResult, position : Position) {
        const status = swapResult.status;
        if (isTransactionPreparationFailure(status)) {
            // TODO: mark position as open again
        }
        else if (isTransactionExecutionFailure(status)) {
            // TODO: mark position as open again
        }
        else if (isTransactionParseFailure(status)) {
            // TODO: retry transaction parse
        }
        else if (isSwapExecutionError(status)) {
            // TODO: mark position as open again
        }
        else if (status === 'swap-successful') {
            const summary = swapResult.successfulSwapSummary;
            this.userPositionTracker.closePosition(swapResult.positionID);
            const markPositionAsClosedRequest : MarkPositionAsClosedRequest = {
                positionID : position.positionID,
                tokenAddress : position.token.address,
                vsTokenAddress : position.vsToken.address,
            };
            await markPositionAsClosedInTokenPairPositionTracker(markPositionAsClosedRequest, this.env);
        }
    }

    // this is the callback from executing a buy
    async buySwapCallback(positionRequest: PositionRequest, swapResult : SwapResult, tokenInfo : TokenInfo, chatID : number) {
        const status = swapResult.status;
        // TODO: 1. these error message may be wrong.
        // TODO: 2. appropriate retries.
        if (isTransactionPreparationFailure(status)) {
            await sendMessageToTG(chatID, `Purchase failed.`, this.env);
        }
        else if (isTransactionExecutionFailure(status)) {
            await sendMessageToTG(chatID, `Purchase failed.`, this.env);
        }
        else if (isRetryableTransactionParseFailure(status)) {
            await sendMessageToTG(chatID, `Purchase failed.`, this.env);
        }
        else if (isTransactionParseFailure(status)) {
            await sendMessageToTG(chatID, `Purchase failed.`, this.env);
        }
        else if (isSwapExecutionError(status)) {
            await sendMessageToTG(chatID, `Purchase failed.`, this.env);
        }
        else {
            const swapSummary = swapResult.successfulSwapSummary!!;

            const position = this.convertToPosition(positionRequest, swapSummary, tokenInfo);

            // should be non-blocking, so fire-and-forget
            this.sendBuyTokenSwapSummaryToUser(chatID, swapSummary);

            await this.addPositionToTracking(position);
        }
    }

    async addPositionToTracking(position : Position) : Promise<ImportNewPositionsResponse> {
        this.userPositionTracker.storePositions([position]);
        const response = await importNewPosition(position, this.env);
        return response;
    }

    convertToPosition(positionRequest: PositionRequest, swapSummary : SuccessfulSwapSummary, tokenInfo : TokenInfo) : Position {
        const vsTokenInfo = getVsTokenInfo(positionRequest.vsTokenAddress)!!;
        const position : Position = {
            userID: positionRequest.userID,
            positionID : positionRequest.positionID,
            type: positionRequest.type,
            status: PositionStatus.Open,
            token: tokenInfo,
            vsToken: vsTokenInfo,
            vsTokenAmt : swapSummary.inTokenAmt,
            tokenAmt: swapSummary.outTokenAmt,
            sellSlippagePercent: positionRequest.slippagePercent,
            triggerPercent : positionRequest.triggerPercent,
            retrySellIfSlippageExceeded : positionRequest.retrySellIfSlippageExceeded,
            fillPrice: swapSummary.fillPrice
        };
        return position;
    }

    async sendBuyTokenSwapSummaryToUser(chatID:  number, summary: SuccessfulSwapSummary) {
        const tokenInfoResponse = await getTokenInfo(summary.outTokenAddress, this.env);
        if (tokenInfoResponse.type === 'valid') {
            const tokenInfo = tokenInfoResponse.tokenInfo!!;
            const summaryMessage = `${summary.outTokenAmt} of ${tokenInfo.symbol} purchased (${summary.fees} SOL in fees)`;
            await sendMessageToTG(chatID, summaryMessage, this.env);
        }
        else {
            // TODO: log errors
        }
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
        if (this.wallet) {
            throw new Error("User already has wallet");
        }
    }

    assertUserHasWallet() {
        if (!this.wallet) {
            throw new Error("User has no wallet");
        }
    }    

    makeUserData(messageID : number) : UserData {
        
        const session = this.sessionTracker.getSessionValues(messageID);
        return {
            hasWallet: !!(this.wallet),
            initialized: this.initialized(),
            telegramUserName : this.telegramUserName||undefined,
            session: session
        };
    }
}