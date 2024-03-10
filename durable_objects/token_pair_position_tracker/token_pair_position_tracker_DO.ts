import { DurableObjectState } from "@cloudflare/workers-types";
import { Position, PositionRequest } from "../../positions/positions";
import { makeJSONResponse } from "../../util/http_helpers";
import { TokenPairPositionTrackerDOFetchMethod, parseTokenPairPositionTrackerDOFetchMethod } from "./token_pair_position_tracker_DO_interop";
import { TokenPairPositionTracker } from "./trackers/token_pair_position_tracker";
import { Env } from "../../env";
import { ManuallyClosePositionRequest, ManuallyClosePositionResponse } from "../user/actions/manually_close_position";
import { OpenPositionResponse } from "../user/actions/open_new_position";
import { TokenPairPositionTrackerInitializeRequest } from "./actions/initialize_token_pair_position_tracker";
import { ImportNewPositionsRequest, ImportNewPositionsResponse } from "./actions/import_new_positions";
import { UpdatePriceRequest, UpdatePriceResponse  } from "./actions/update_price";
import { DecimalizedAmount } from "../../decimalized/decimalized_amount";
import { sendClosePositionOrdersToUserDOs } from "../user/userDO_interop";
import { AutomaticallyClosePositionRequest, AutomaticallyClosePositionsRequest } from "./actions/automatically_close_positions";
import { MarkPositionAsClosedRequest, MarkPositionAsClosedResponse } from "./actions/mark_position_as_closed";
import { MarkPositionAsClosingRequest, MarkPositionAsClosingResponse } from "./actions/mark_position_as_closing";

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
            case TokenPairPositionTrackerDOFetchMethod.requestNewPosition:
                this.assertIsInitialized();
                return await this.handleRequestNewPosition(body);
            case TokenPairPositionTrackerDOFetchMethod.importNewOpenPositions:
                this.assertIsInitialized();
                return await this.handleImportNewOpenPositions(body);
            case TokenPairPositionTrackerDOFetchMethod.markPositionAsClosing:
                this.assertIsInitialized();
                return await this.handleMarkPositionAsClosing(body);
            case TokenPairPositionTrackerDOFetchMethod.markPositionAsClosed:
                this.assertIsInitialized();
                return await this.handleMarkPositionAsClosed(body);
            default:
                throw new Error(`Unknown method ${method}`);
        }
    }

    async handleImportNewOpenPositions(body : ImportNewPositionsRequest) {
        const responseBody : ImportNewPositionsResponse = {};
        this.tokenPairPositionTracker.importNewOpenPositions(body.positions);
        return makeJSONResponse(responseBody);
    }

    async handleMarkPositionAsClosed(body: MarkPositionAsClosedRequest) : Promise<Response> {
        this.tokenPairPositionTracker.closePosition(body.positionID);
        const responseBody : MarkPositionAsClosedResponse = {};
        return makeJSONResponse(responseBody)
    }

    async handleMarkPositionAsClosing(body : MarkPositionAsClosingRequest): Promise<Response> {
        this.tokenPairPositionTracker.markPositionAsClosing(body.positionID);
        const responseBody : MarkPositionAsClosingResponse = {};
        return makeJSONResponse(responseBody);
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

    async handleUpdatePrice(request : UpdatePriceRequest) : Promise<Response> {
        const newPrice = request.price;
        this.updatePrice(newPrice);
        const responseBody : UpdatePriceResponse = {};
        return makeJSONResponse(responseBody);
    }
    
    async handleRequestNewPosition(request : Request) : Promise<Response> {
        const positionRequest : PositionRequest = await request.json();
        const actionsToTake = this.tokenPairPositionTracker.addPositionRequest(positionRequest);
        //this.processActionsToTake(actionsToTake);
        const responseBody : OpenPositionResponse = {};
        return makeJSONResponse(responseBody);
    }

    async callbackSuccessFillingPosition(position : Position) {
        this.tokenPairPositionTracker.callbackSuccessFilledPosition(position);
        //this.notifyUserPositionFilled(position);
    }

    async callbackFailureFillingPosition(position : Position) {
        this.tokenPairPositionTracker.callbackFailureFilledPosition(position);
        //this.notifyUserPositionFailedToFill(position);
    }

    async callbackSuccessClosePositions(positions : Position[]) {
        for (const position of positions) {
            //this.tokenPairPositionTracker.callbackSuccessClosedPosition(position);
            //this.notifyUserPositionClosed(position);
        }
    }

    async callbackFailureToClosePositions(positions : Position[]) {
        for (const position of positions) {
            //this.tokenPairPositionTracker.callbackFailureToClosePositions(position);
            //this.notifyUserPositionDidNotClose(position);
        }
    }    

    async updatePrice(newPrice : DecimalizedAmount) {
        // fire and forget so we don't block subsequent update-price ticks
        const positionsToClose = this.tokenPairPositionTracker.updatePrice(newPrice);
        const request : AutomaticallyClosePositionsRequest = { positions: positionsToClose.positionsToClose }
        sendClosePositionOrdersToUserDOs(request, this.env);
    }

    async sendOrdersToClosePositions(positions : Position[]) {
        const positionsByUserID = this.groupPositionsByUser(positions);
        for (const [userID,positions] of positionsByUserID) {
            this.sendClosePositionOrdersToUserDO(userID, positions);
        }
    }

    sendClosePositionOrdersToUserDO(telegramUserID : number, positionsToClose :Position[]) {
        //closePositions(telegramUserID, positionsToClose);
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