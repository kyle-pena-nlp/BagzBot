import { DurableObjectState } from "@cloudflare/workers-types";
import { Position, PositionRequest, PositionType, PositionStatus } from "../../positions/positions";
import { 
    ClosePositionRequest, 
    PriceUpdate, 
    TokenPairPositionTrackerInitializeRequest,
    LongTrailingStopLossPositionRequestResponse,
    ClosePositionsResponse} from "../../common";
import { makeJSONResponse } from "../../util/http_helpers";
import { TokenPairPositionTrackerDOFetchMethod, parseTokenPairPositionTrackerDOFetchMethod } from "./token_pair_position_tracker_DO_interop";
import { PositionsToClose, TokenPairPositionTracker } from "./token_pair_position_tracker";
import { Env } from "../../env";

/* 
    Durable Object storing all open positions for a single token/vsToken pair.  
    Triggers appropriate actions when price updates. 
    Also serves as point of contact for RPC
*/
export class TokenPairPositionTrackerDO {

    // persistence for this durable object
    state :   DurableObjectState

    // initialized properties - token and the 'swap-from' vsToken (i.e; USDC)
    tokenAddress :   string|null
    vsTokenAddress : string|null
    
    // this performs all the book keeping and determines what RPC actions to take
    tokenPairPositionTracker : TokenPairPositionTracker = new TokenPairPositionTracker();
    
    env : Env

    constructor(state : DurableObjectState, env : Env) {

        this.state       = state; // access to persistent storage (as opposed to in-memory)
        
        this.tokenAddress       = null;  // address of token being traded
        this.vsTokenAddress     = null;  // i.e.; USDC or SOL

        /* RPC connection */
        this.env = env;
    }

    initialized() : boolean {
        return this.vsTokenAddress != null && this.tokenAddress != null;
    }

    async fetch(request : Request) : Promise<Response> {

        const [method,body] = await this.validateFetchRequest(request);

        switch(method) {
            case TokenPairPositionTrackerDOFetchMethod.initialize:
                return await this.handleInitialize(body);
            case TokenPairPositionTrackerDOFetchMethod.updatePrice:
                this.assertIsInitialized();
                return await this.handleUpdatePrice(body);
            case TokenPairPositionTrackerDOFetchMethod.manuallyClosePosition:
                this.assertIsInitialized();
                return await this.handleManuallyClosePosition(body);
            case TokenPairPositionTrackerDOFetchMethod.requestNewPosition:
                this.assertIsInitialized();
                return await this.handleRequestNewPosition(body);
            default:
                throw new Error(`Unknown method ${method}`);
        }
    }

    async validateFetchRequest(request : Request) : Promise<[TokenPairPositionTrackerDOFetchMethod,any]> {
        const jsonBody : any = await request.json();
        const methodName = new URL(request.url).pathname.substring(1);
        const method : TokenPairPositionTrackerDOFetchMethod|null = parseTokenPairPositionTrackerDOFetchMethod(methodName);
        if (method == null) {
            throw new Error(`Unknown method ${method}`);
        }
        return [method,jsonBody];
    }

    assertIsInitialized() {
        if (!this.initialized()) {
            throw new Error("Must initialized before using");
        }
    }

    async handleInitialize(initializeRequest : TokenPairPositionTrackerInitializeRequest) : Promise<Response> {
        if (!this.initialized()) {
            this.tokenAddress = initializeRequest.token.address;
            this.vsTokenAddress = initializeRequest.vsToken.address;
        }
        return new Response(null, { status: 200 });
    }

    async handleUpdatePrice(request : Request) : Promise<Response> {
        const body : PriceUpdate = await request.json();
        const newPrice = body.price;
        this.updatePrice(newPrice);
        return new Response();
    }

    async handleManuallyClosePosition(request : Request) : Promise<Response> {
        const body : ClosePositionRequest = await request.json();
        const positionID = body.positionID;
        const actionsToTake = this.tokenPairPositionTracker.manuallyClosePosition(positionID);
        this.processActionsToTake(actionsToTake);
        const responseBody : ClosePositionsResponse = {};
        return makeJSONResponse(responseBody);
    }

    async handleRequestNewPosition(request : Request) : Promise<Response> {
        const positionRequest : PositionRequest = await request.json();
        const actionsToTake = this.tokenPairPositionTracker.addPositionRequest(positionRequest);
        this.processActionsToTake(actionsToTake);
        const responseBody : LongTrailingStopLossPositionRequestResponse = {};
        return makeJSONResponse(responseBody);
    }

    async callbackSuccessFillingPosition(position : Position) {
        this.tokenPairPositionTracker.callbackSuccessFilledPosition(position);
        this.notifyUserPositionFilled(position);
    }

    async callbackFailureFillingPosition(position : Position) {
        this.tokenPairPositionTracker.callbackFailureFilledPosition(position);
        this.notifyUserPositionFailedToFill(position);
    }

    async callbackSuccessClosePositions(positions : Position[]) {
        for (const position of positions) {
            this.tokenPairPositionTracker.callbackSuccessClosedPosition(position);
            this.notifyUserPositionClosed(position);
        }
    }

    async callbackFailureToClosePositions(positions : Position[]) {
        for (const position of positions) {
            this.tokenPairPositionTracker.callbackFailureToClosePositions(position);
            this.notifyUserPositionDidNotClose(position);
        }
    }    

    async updatePrice(newPrice : number) {
        /* 1. Incorporate new open positions since last tick into price data structures */
        /* 2. Update price data structures with new price */
        /* 3. Collect trades to execute, execute them.    */
        /* 4. (callbacks in event of failure cases handled elsewhere) */

        const positionsToClose = this.tokenPairPositionTracker.updatePrice(newPrice);
        this.sendOrdersToClosePositions(positionsToClose);
    }

    async sendOrdersToClosePositions(positions : Position[]) {
        const positionsByUserID = this.groupPositionsByUser(positions);
        for (const [userID,positions] of positionsByUserID) {
            this.sendClosePositionOrdersToUserDO(userID, positions);
        }
    }

    sendClosePositionOrdersToUserDO(telegramUserID : number, positionsToClose :Position[]) {
        closePositions(telegramUserID, positionsToClose);
    }

    private groupPositionsByUser(positions : Position[]) : Map<number,Position[]> {
        const record = new Map<number,Position[]>();
        for (const position of positions) {
            const userID = position.userID;
            if (!(userID in record)) {
                record.set(userID, []);
            }
            record.get(userID)!!.push(position);
        }
        return record;
    }
}