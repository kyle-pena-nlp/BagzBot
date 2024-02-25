import { DurableObjectState } from "@cloudflare/workers-types";
import { 
    Wallet, 
    UserInitializeRequest, 
    ClosePositionsRequest,
    UserData,
    GetUserDataRequest, 
    EvictSessionRequest,
    Position,
    PositionDisplayInfo,
    StoreSessionValuesRequest,
    OpenPositionRequest,
    LongTrailingStopLossPositionRequest,
    Env,
    GetSessionValuesRequest,
    SessionValuesResponse,
    UserDOFetchMethod,
    makeTokenPairPositionTrackerDOFetchRequest,
    TokenPairPositionTrackerDOFetchMethod,
    TokenPairPositionTrackerInitializeRequest,
    ClosePositionRequest,
    ManuallyClosePositionRequest,
    NotifyPositionsAutoClosedRequest,
    NotifyPositionAutoClosedRequest,
    NotifyPositionAutoClosedInfo,
    GetPositionsFromTokenPairTrackerResponse,
    GetPositionsFromTokenPairTrackerRequest} from "./common";
import * as crypto from "node:crypto";
import { makeSuccessResponse, makeJSONResponse, makeJSONRequest, makeFailureResponse } from "./http_helpers";
import { SessionTracker } from "./session_tracker";
import { PositionTracker } from "./position_tracker";

/* Durable Object storing state of user */
export class UserDO {

    /* Handles/persists session state management, basic facts about user (like name), and wallet */
    env : Env
    state: DurableObjectState;
    initialized : boolean;
    durableObjectID : string;
    telegramUserID : number|null;
    telegramUserName : string|null;
    wallet : Wallet|null;
    sessionTracker : SessionTracker = new SessionTracker();
    positionTracker : PositionTracker = new PositionTracker();

    constructor(state : DurableObjectState, env : any) {
        // persistent state object which reaches eventual consistency
        this.env                = env;
        this.state              = state;
        this.durableObjectID    = this.state.id.toString();
        this.initialized        = false;
        this.telegramUserID     = null;
        this.telegramUserName   = null;
        this.wallet             = null;
        this.state.blockConcurrencyWhile(async () => {
            await this.initializeFromPersistence();
        });
    }

    async initializeFromPersistence() {
        const storage = await this.state.storage.list();
        for (const key in Object.keys(storage)) {
            switch(key) {
                case 'initialized':
                    this.initialized = (storage.get(key)||false) as boolean;
                    break;
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

    async fetch(request : Request) : Promise<Response> {

        const [method,jsonRequestBody] = await this.validateRequest(request);

        switch(method) {
            case UserDOFetchMethod.get:
                return this.handleGet(jsonRequestBody);            
            case UserDOFetchMethod.initialize:
                this.assertUserIsNotInitialized();
                return await this.handleInitialize(jsonRequestBody)            
            case UserDOFetchMethod.storeSessionValues:
                this.assertUserIsInitialized();
                return await this.handleStoreSessionValues(jsonRequestBody);
            case UserDOFetchMethod.getSessionValues:
                this.assertUserIsInitialized();
                return await this.handleGetSessionValues(jsonRequestBody);
            case UserDOFetchMethod.deleteSession:
                this.assertUserIsInitialized();
                return await this.handleDeleteSession(jsonRequestBody);
            case UserDOFetchMethod.generateWallet:
                this.assertUserIsInitialized();
                this.assertUserHasNoWallet();
                return await this.handleGenerateWallet();
            case UserDOFetchMethod.requestNewPosition:
                this.assertUserIsInitialized();
                this.assertUserHasWallet();
                return await this.handleOpenPositionsRequest(jsonRequestBody);
            case UserDOFetchMethod.manuallyClosePosition:
                this.assertUserIsInitialized();
                this.assertUserHasWallet();
                return await this.handleManuallyClosePositionRequest(jsonRequestBody);
            case UserDOFetchMethod.notifyPositionFillSuccess:
                this.assertUserIsInitialized();
                this.assertUserHasWallet();
                return await this.handleNotifyPositionFilledSuccess(jsonRequestBody);
            case UserDOFetchMethod.notifyPositionFillFailure:
                this.assertUserIsInitialized();
                this.assertUserHasWallet();
                return await this.handleNotifyPositionFilledFailure(jsonRequestBody);
            case UserDOFetchMethod.notifyPositionAutoClosed:
                this.assertUserIsInitialized();
                this.assertUserHasWallet();
                return await this.handleNotifyPositionAutoClosed(jsonRequestBody);
            case UserDOFetchMethod.notifyPositionsAutoClosed:
                this.assertUserIsInitialized();
                this.assertUserHasWallet();
                return await this.handleNotifyPositionsAutoClosed(jsonRequestBody);
            default:
                throw new Error(`Unrecognized method for UserDO: ${method}`);
        }
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
        if (position.notifyPositionAutoClosedInfo.retrySellPositionID != null) {
            const tokenAddress = position.notifyPositionAutoClosedInfo.tokenAddress;
            const vsTokenAddress = position.notifyPositionAutoClosedInfo.vsTokenAddress;
            const retrySellPositions = await this.getRetrySellPositionsFromTokenPairTracker(tokenAddress, vsTokenAddress, [position.notifyPositionAutoClosedInfo]);
            this.positionTracker.storePositions(retrySellPositions);
        }
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
        const promises  = [];
        for (const tokenPairIdentifier of Object.keys(groupedNotifications)) {
            const infos = groupedNotifications[tokenPairIdentifier];
            const [tokenAddress,vsTokenAddress] = tokenPairIdentifier.split(":");
            const promise = this.getRetrySellPositionsFromTokenPairTracker(tokenAddress, vsTokenAddress, infos).then(async (positions) => {
                this.positionTracker.storePositions(positions);
            });
            promises.push(promise);
        }
        promises.push(this.positionTracker.flushToStorage(this.state.storage));
        return await Promise.all(promises).then(() => {
            return makeSuccessResponse();
        });
    }

    async getRetrySellPositionsFromTokenPairTracker(tokenAddress : string, vsTokenAddress : string, infos : NotifyPositionAutoClosedInfo[]) : Promise<Position[]> {
        const positionIDs = infos.filter(x => { return x.retrySellPositionID != null; }).map(x => { return x.retrySellPositionID!! })
        if (positionIDs.length == 0) {
            return [];
        }
        const getPositionsRequest : GetPositionsFromTokenPairTrackerRequest = {
            positionIDs: positionIDs
        }
        const request = makeTokenPairPositionTrackerDOFetchRequest(TokenPairPositionTrackerDOFetchMethod.getPositions, getPositionsRequest);
        const tokenPairPositionTrackerDO : DurableObjectStub = this.getTokenPairPositionTrackerDO(tokenAddress, vsTokenAddress);
        return await tokenPairPositionTrackerDO.fetch(request).then(async (response) => {
            if (!response.ok) {
                throw new Error("Could not retrieve positions from tracker");
            }
            else {
                const positionsResponse = (await response.json()) as GetPositionsFromTokenPairTrackerResponse;
                return positionsResponse.positions;
            }
        })
    }

    handleGet(jsonRequestBody : GetUserDataRequest) : Response {
        const messageID = jsonRequestBody.messageID;
        return makeJSONResponse(this.makeUserData(messageID));
    }

    async handleDeleteSession(jsonRequestBody : EvictSessionRequest) : Promise<Response> {
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
            return makeSuccessResponse();
        })
    }

    async handleGetSessionValues(jsonRequestBody : GetSessionValuesRequest) : Promise<Response> {
        const messageID = jsonRequestBody.messageID;
        const sessionValues : Record<string,boolean|number|string|null> = {};
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
        this.telegramUserID = userInitializeRequest.telegramUserID;
        this.telegramUserName = userInitializeRequest.telegramUserName;
        return await this.state.storage.put({ 
            "telegramUserID": this.telegramUserID, 
            "telegramUserName": this.telegramUserName 
        }).then(() => {
            this.initialized = true;
            return makeSuccessResponse();
        });
    }

    async handleGenerateWallet() : Promise<Response> {
        // TODO: base 54 or whatever instead of pem
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
        const pubKey = publicKey.export({ type: 'spki', format: 'pem' }).toString('hex');
        const priKey = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString('hex');
        this.wallet = {
            publicKey: pubKey,
            privateKey: priKey
        };
        return await this.state.storage.put("wallet",this.wallet).then(() => {
            return makeSuccessResponse();
        });
    }

    async handleOpenPositionsRequest(newPositionRequest : LongTrailingStopLossPositionRequest) : Promise<Response> {
        const tokenPairPositionTrackerDO = this.getTokenPairPositionTrackerDO(newPositionRequest.tokenAddress, newPositionRequest.vsTokenAddress) as DurableObjectStub;
        await this.ensureTokenPairPositionTrackerDOIsInitialized(newPositionRequest.token, 
            newPositionRequest.tokenAddress, 
            newPositionRequest.vsToken, 
            newPositionRequest.vsTokenAddress, 
            tokenPairPositionTrackerDO);
        const _openPositionRequest = makeTokenPairPositionTrackerDOFetchRequest(TokenPairPositionTrackerDOFetchMethod.initialize, newPositionRequest);
        return await tokenPairPositionTrackerDO.fetch(_openPositionRequest).then((response : Response) => {
            if (response.ok) {
                return makeSuccessResponse();
            }
            else {
                return makeFailureResponse("Could not fill position request");
            }
        });
    }

    async ensureTokenPairPositionTrackerDOIsInitialized(token : string, tokenAddress : string, vsToken : string, vsTokenAddress : string, tokenPairPositionTrackerDO : DurableObjectStub) : Promise<void> {
        const body: TokenPairPositionTrackerInitializeRequest = {
            durableObjectID : tokenPairPositionTrackerDO.id.toString(),
            token : token,
            vsToken : vsToken,
            tokenAddress: tokenAddress,
            vsTokenAddress: vsTokenAddress
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
            position.tokenAddress, 
            position.vsToken, 
            position.vsTokenAddress, 
            tokenPairPositionTrackerDO);
        const request = makeTokenPairPositionTrackerDOFetchRequest(TokenPairPositionTrackerDOFetchMethod.manuallyClosePosition, manuallyClosePositionRequest);
        return await tokenPairPositionTrackerDO.fetch(request).then((response) => {
            return response;
        });
    }

    async validateRequest(request : Request) : Promise<[UserDOFetchMethod,any]> {
        const jsonBody : any = await request.json();
        const methodName = new URL(request.url).pathname;
        if (jsonBody.durableObjectID !== this.durableObjectID) {
            throw new Error("Mismatched durableObjectID on ${method}");
        }
        const method : UserDOFetchMethod = UserDOFetchMethod[methodName as keyof typeof UserDOFetchMethod];
        if (method == null) {
            throw new Error(`Unknown method ${method}`);
        }
        return [method,jsonBody];
    }

    assertUserIsNotInitialized() {
        if (this.initialized) {
            throw new Error("User is already initialized");
        }
    }

    assertUserIsInitialized() {
        if (!this.initialized) {
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
            initialized: this.initialized,
            session: session,
            positions: positionDisplayInfos
        };
    }

    getTokenPairPositionTrackerDO(tokenAddress : string, vsTokenAddress : string) : any {
        const namespace : DurableObjectNamespace = this.env.TokenPairPositionTrackerDO;
        const id = namespace.idFromName(`${tokenAddress}:${vsTokenAddress}`);
        return namespace.get(id);
    }

    makePositionDisplayInfos() : PositionDisplayInfo[] {
        const positions = this.positionTracker.getPositions();
        const positionDisplayInfos : PositionDisplayInfo[] = [];
        for (const position of positions) {
            const positionDisplayInfo : PositionDisplayInfo = {
                positionID : position.positionID,
                token: position.token,
                amount : position.tokenAmt,
                positionTypeName : position.type.toString()
            };
            positionDisplayInfos.push(positionDisplayInfo);
        }
        return positionDisplayInfos;
    }
}