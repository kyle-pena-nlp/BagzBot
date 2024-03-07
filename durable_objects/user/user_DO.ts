import { DurableObjectState } from "@cloudflare/workers-types";
import { 
    TokenPairPositionTrackerInitializeRequest,
    NotifyPositionsAutoClosedRequest,
    NotifyPositionAutoClosedRequest,
    NotifyPositionAutoClosedInfo,
    GetPositionRequest,
    DefaultTrailingStopLossRequestRequest,
    LongTrailingStopLossPositionRequestResponse,
    ListPositionsRequest} from "../../common";

import { UserData } from "./model/user_data";
import { ManuallyClosePositionRequest, ManuallyClosePositionResponse } from "../../worker/actions/manually_close_position";
import { UserInitializeRequest, UserInitializeResponse } from "./actions/user_initialize";
import { GetUserDataRequest } from "./actions/get_user_data";
import { DeleteSessionRequest } from "./actions/delete_session";
import { StoreSessionValuesRequest, StoreSessionValuesResponse } from "./actions/store_session_values";
import { GetSessionValuesRequest, SessionValuesResponse} from "./actions/get_session_values";
import { GetSessionValuesWithPrefixRequest, GetSessionValuesWithPrefixResponse } from "./actions/get_session_values";
import { AutomaticallyClosePositionsRequest, AutomaticallyClosePositionsResponse } from "../token_pair_position_tracker/actions/automatically_close_positions";

import { SessionValue } from "./model/session";

import { makeSuccessResponse, makeJSONResponse, makeFailureResponse, maybeGetJson } from "../../util/http_helpers";
import { SessionTracker } from "./trackers/session_tracker";
import { UserPositionTracker } from "./trackers/user_position_tracker";
import { generateEd25519Keypair } from "../../crypto/cryptography";
import { UserDOFetchMethod, parseUserDOFetchMethod } from "./userDO_interop";
import { TokenPairPositionTrackerDOFetchMethod, makeTokenPairPositionTrackerDOFetchRequest } from "../token_pair_position_tracker/token_pair_position_tracker_DO_interop";
import {  sellTokenAndParseSwapTransaction, buyTokenAndParseSwapTransaction, SwapResult, isTransactionPreparationFailure, isTransactionExecutionFailure, isTransactionConfirmationFailure, isTransactionParseFailure, isSwapExecutionError } from "../../rpc/rpc_interop";
import { getVsTokenInfo } from "../../tokens/vs_tokens";
import { Env } from "../../env";
import { Wallet } from "../../crypto/wallet";
import { PositionRequest, Position, PositionType } from "../../positions/positions";
import { TokenInfo } from "../../tokens/token_info";
import { PositionDisplayInfo } from "./model/position_display_info";

/* Durable Object storing state of user */
export class UserDO {

    /* Handles/persists session state management, basic facts about user (like name), and wallet */
    env : Env
    state: DurableObjectState;
    durableObjectID : string;
    telegramUserID : number|null;
    telegramUserName : string|null;
    wallet : Wallet|null;
    defaultTrailingStopLossRequest : PositionRequest;
    sessionTracker : SessionTracker = new SessionTracker();
    positionTracker : UserPositionTracker = new UserPositionTracker();

    constructor(state : DurableObjectState, env : any) {
        // persistent state object which reaches eventual consistency
        this.env                = env;
        this.state              = state;
        this.durableObjectID    = this.state.id.toString();
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
            vsTokenAmt : 1,
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
        this.positionTracker.initialize(storage);
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
                response = await this.handleGenerateWallet();
                break;
            case UserDOFetchMethod.requestNewPosition:
                this.assertUserIsInitialized();
                this.assertUserHasWallet();
                response = await this.handleOpenPositionsRequest(jsonRequestBody);
                break;
            case UserDOFetchMethod.getPosition:
                this.assertUserIsInitialized();
                this.assertUserHasWallet();
                response = await this.getPosition(jsonRequestBody);
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
            case UserDOFetchMethod.notifyPositionFillSuccess:
                this.assertUserIsInitialized();
                this.assertUserHasWallet();
                response = await this.handleNotifyPositionFilledSuccess(jsonRequestBody);
                break;
            case UserDOFetchMethod.notifyPositionFillFailure:
                this.assertUserIsInitialized();
                this.assertUserHasWallet();
                response = await this.handleNotifyPositionFilledFailure(jsonRequestBody);
                break;
            case UserDOFetchMethod.notifyPositionAutoClosed:
                this.assertUserIsInitialized();
                this.assertUserHasWallet();
                response = await this.handleNotifyPositionAutoClosed(jsonRequestBody);
                break;
            case UserDOFetchMethod.notifyPositionsAutoClosed:
                this.assertUserIsInitialized();
                this.assertUserHasWallet();
                response = await this.handleNotifyPositionsAutoClosed(jsonRequestBody);
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
        const positions = this.positionTracker.listPositions();
        return makeJSONResponse(positions);
    }

    /* Handles any exceptions and turns them into failure responses - fine because UserDO doesn't talk directly to TG */
    async catchResponse(promise : Promise<Response>) : Promise<Response> {
        return promise.catch((reason) => {
            return makeFailureResponse(reason.toString());
        });
    }

    async getPosition(getPositionRequest: GetPositionRequest) {
        const position = this.positionTracker.getPosition(getPositionRequest.positionID);
        return makeJSONResponse(position);
    }

    async handleNotifyPositionFilledSuccess(position : Position) : Promise<Response> {
        this.positionTracker.storePositions([position]);
        return await this.positionTracker.flushToStorage(this.state.storage).then(() => {
            // TODO: send confirmatory message to user
            return makeSuccessResponse();
        });
    }

    async handleNotifyPositionFilledFailure(position : Position) : Promise<Response> {
        this.positionTracker.storePositions([position]);
        return await this.positionTracker.flushToStorage(this.state.storage).then(() => {
            // TODO: send confirmatory message to user
            return makeSuccessResponse();
        });
    }    

    async handleNotifyPositionAutoClosed(position : NotifyPositionAutoClosedRequest) : Promise<Response> {
        const positionID = position.notifyPositionAutoClosedInfo.positionID;
        this.positionTracker.deletePosition(positionID);
        /*if (position.notifyPositionAutoClosedInfo.retrySellPositionID != null) {
            const tokenAddress = position.notifyPositionAutoClosedInfo.tokenAddress;
            const vsTokenAddress = position.notifyPositionAutoClosedInfo.vsTokenAddress;
            const retrySellPositions = await this.getRetrySellPositionsFromTokenPairTracker(tokenAddress, vsTokenAddress, [position.notifyPositionAutoClosedInfo]);
            this.positionTracker.storePositions(retrySellPositions);
        }*/
        // TODO: retry logic.
        return await this.positionTracker.flushToStorage(this.state.storage).then(() => {
            // TODO: send confirmatory message to user.
            return makeSuccessResponse();
        });
    }

    async handleNotifyPositionsAutoClosed(notification : NotifyPositionsAutoClosedRequest) : Promise<Response> {
        
        // group the notifications by token pair
        const groupedNotifications : Record<string,NotifyPositionAutoClosedInfo[]> = {};
        for (const info of notification.notifyPositionAutoClosedInfos) {
            const tokenPairIdentifier = `${info.tokenAddress}:${info.vsTokenAddress}`;
            if (!(tokenPairIdentifier in groupedNotifications)) {
                groupedNotifications[tokenPairIdentifier] = [];
            }
            groupedNotifications[tokenPairIdentifier].push(info);
        }

        // In parallel, fetch the retry-sell positions from the appropriate token pair tracker
        const promises : Promise<Response>[]  = [];
        // TODO: retry logic here? or no longer necessary?
        /*
        for (const tokenPairIdentifier of Object.keys(groupedNotifications)) {
            const infos = groupedNotifications[tokenPairIdentifier];
            const [tokenAddress,vsTokenAddress] = tokenPairIdentifier.split(":");
            const promise = this.getRetrySellPositionsFromTokenPairTracker(tokenAddress, vsTokenAddress, infos).then(async (positions) => {
                this.positionTracker.storePositions(positions);
            });
            promises.push(promise);
        }
        promises.push(this.positionTracker.flushToStorage(this.state.storage));
        */
        return await Promise.all(promises).then(() => {
            return makeSuccessResponse();
        });
    }

    async handleGet(jsonRequestBody : GetUserDataRequest) : Promise<Response> {
        const messageID = jsonRequestBody.messageID;
        return makeJSONResponse(this.makeUserData(messageID));
    }

    async handleDeleteSession(jsonRequestBody : DeleteSessionRequest) : Promise<Response> {
        const messageID = jsonRequestBody.messageID;
        this.sessionTracker.deleteSession(messageID);
        return await this.sessionTracker.flushToStorage(this.state.storage).then(() => {
            return makeSuccessResponse();
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
        const sessionValuesResponseBody : SessionValuesResponse = {
            sessionValues: sessionValues
        };
        const response = makeJSONResponse(sessionValuesResponseBody);
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

    async handleGenerateWallet() : Promise<Response> {
        if (!this.wallet) {
            const { publicKey, privateKey } = await generateEd25519Keypair();
            this.wallet = {
                publicKey: publicKey,
                privateKey: privateKey
            };
            return await this.state.storage.put("wallet",this.wallet).then(() => {
                return makeSuccessResponse();
            }).catch(() => {
                return makeFailureResponse("Could not persist wallet");
            });
        }
        return makeSuccessResponse('Wallet already exists');
    }


    async handleOpenPositionsRequest(newPositionRequest : PositionRequest) : Promise<Response> {
        const tokenPairPositionTrackerDO = this.getTokenPairPositionTrackerDO(newPositionRequest.token, newPositionRequest.vsToken) as DurableObjectStub;
        const _openPositionRequest = makeTokenPairPositionTrackerDOFetchRequest(TokenPairPositionTrackerDOFetchMethod.requestNewPosition, newPositionRequest);
        const response = await tokenPairPositionTrackerDO.fetch(_openPositionRequest);
        const responseBody = await response.json() as LongTrailingStopLossPositionRequestResponse;
        return makeJSONResponse(responseBody);
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
        
        const position = this.positionTracker.getPosition(manuallyClosePositionRequest.positionID);
        if (position == null) {
            return makeFailureResponse('Position no longer exists');
        }
        const tokenPairPositionTrackerDO : DurableObjectStub = this.getTokenPairPositionTrackerDO(position.tokenAddress, position.vsTokenAddress)
        await this.ensureTokenPairPositionTrackerDOIsInitialized(position.token, 
            position.vsToken,  
            tokenPairPositionTrackerDO);
        const request = makeTokenPairPositionTrackerDOFetchRequest(TokenPairPositionTrackerDOFetchMethod.manuallyClosePosition, manuallyClosePositionRequest);
        return await tokenPairPositionTrackerDO.fetch(request).then((response) => {
            return response;
        });
    }

    async handleAutomaticallyClosePositionsRequest(closePositionsRequest : AutomaticallyClosePositionsRequest) : Promise<Response> {
        for (const positionID of closePositionsRequest.positionIDs) {
            const position = this.positionTracker.getPosition(positionID);
            if (position == null) {
                // TODO: how to handle?
                continue;
            }

            // fire and forget.  callbacks will handle state changes / user notifications.
            sellTokenAndParseSwapTransaction(position, this.wallet!!, this.env)
                .then(this.handleSellSwapResult);

        }
        const responseBody : AutomaticallyClosePositionsResponse = {};
        return makeJSONResponse(responseBody);
    }

    async handleOpenPositionRequest(positionRequest: PositionRequest) : Promise<Response> {

        // fire and forget.  callbacks will handle state changes / user notifications.
        buyTokenAndParseSwapTransaction(positionRequest, this.wallet!!, this.env)
            .then(this.handleBuySwapResult)
        return makeSuccessResponse();
    }

    // this is the callback from executing a sell
    async handleSellSwapResult(swapResult : SwapResult) {
        const status = swapResult.status;
        if (isTransactionPreparationFailure(status)) {
            
        }
        else if (isTransactionExecutionFailure(status)) {

        }
        else if (isTransactionConfirmationFailure(status)) {

        }
        else if (isTransactionParseFailure(status)) {

        }
        else if (isSwapExecutionError(status)) {

        }
        else {
            
        }
    }

    // this is the callback from executing a buy
    async handleBuySwapResult(swapResult : SwapResult) {
        const status = swapResult.status;
        if (isTransactionPreparationFailure(status)) {
            
        }
        else if (isTransactionExecutionFailure(status)) {

        }
        else if (isTransactionConfirmationFailure(status)) {

        }
        else if (isTransactionParseFailure(status)) {

        }
        else if (isSwapExecutionError(status)) {

        }
        else {
            
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

        const positionDisplayInfos = this.makePositionDisplayInfos();

        return {
            durableObjectID: this.durableObjectID,
            hasWallet: !!(this.wallet),
            initialized: this.initialized(),
            telegramUserName : this.telegramUserName||undefined,
            session: session,
            positions: positionDisplayInfos
        };
    }

    getTokenPairPositionTrackerDO(token : TokenInfo, vsToken : TokenInfo) : any {
        const namespace : DurableObjectNamespace = this.env.TokenPairPositionTrackerDO;
        const id = namespace.idFromName(`${token.address}:${vsToken.address}`);
        const stub = namespace.get(id);
        this.ensureTokenPairPositionTrackerDOIsInitialized(token, vsToken, stub)
        return stub;
    }

    makePositionDisplayInfos() : PositionDisplayInfo[] {
        const positions = this.positionTracker.listPositions();
        const positionDisplayInfos : PositionDisplayInfo[] = [];
        for (const position of positions) {
            const positionDisplayInfo : PositionDisplayInfo = {
                positionID : position.positionID,
                token: position.token.name,
                amount : position.tokenAmt,
                positionTypeName : position.type.toString()
            };
            positionDisplayInfos.push(positionDisplayInfo);
        }
        return positionDisplayInfos;
    }
}