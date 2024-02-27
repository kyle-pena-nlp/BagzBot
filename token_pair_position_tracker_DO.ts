import { DurableObjectState } from "@cloudflare/workers-types";

import { 
    PositionRequest,
    ClosePositionRequest, 
    Position, 
    PositionStatus,
    PriceUpdate, 
    PositionType,
    LongTrailingStopLossPosition, 
    TokenPairPositionTrackerInitializeRequest} from "./common";
import { makeJSONRequest } from "./http_helpers";
import { TokenPairPositionTrackerDOFetchMethod } from "./token_pair_position_tracker_DO_interop";



/* 
    Durable Object storing all open positions for a single token/vsToken pair.  
    Triggers appropriate actions when price updates. 
*/
export class TokenPairPositionTrackerDO {

    // persistence for this durable object
    state :   DurableObjectState

    initialized : boolean

    // token and the 'swap-from' vsToken (i.e; USDC)
    token :   string|null
    vsToken : string|null
    
    // staging of positions
    unfilledPositions : Map<string,PositionRequest>
    newOpenPositions :  Map<string,Position>
    openPositions :     Map<string,Position>
    closingPositions :  Map<string,Position>
    closedPositions :   Map<string,Position>

    // datastructure for quick updating of prices across many positions
    pricePeaks : Map<number,Position[]>
    
    // RPC endpoint for executing token swaps
    rpc_endpoint_url : string

    constructor(state : DurableObjectState, env : any) {

        this.state       = state; // access to persistent storage (as opposed to in-memory)
        this.initialized = false;
        this.token       = null;  // address of token being traded
        this.vsToken     = null;  // i.e.; USDC or SOL

        /* Queues */
        this.unfilledPositions   = new Map();  // positions sent to exchange, but not yet filled. {ID->Position}.
        this.newOpenPositions    = new Map();  // positions open, but not yet incorporated into datastructures. {ID->Position}.
        this.openPositions       = new Map();  // positions open, incorporated into datastructure.  Refers to same object in datastructure by ref.
        this.closingPositions    = new Map();  // positions that will be closed
        this.closedPositions     = new Map();  // positions that are confirmed closed

        /* Data Structures */
        this.pricePeaks            = new Map(); // {PeakPrice->List[Open Positions With This Peak Price]}
        
        /* RPC connection */
        this.rpc_endpoint_url = env.RPC_ENDPOINT_URL;
    }

    async fetch(request : Request) : Promise<Response> {

        const [method,body] = await this.validateRequest(request);

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

    async validateRequest(request : Request) : Promise<[TokenPairPositionTrackerDOFetchMethod,any]> {
        const jsonBody : any = await request.json();
        const methodName = new URL(request.url).pathname.substring(1);
        const method : TokenPairPositionTrackerDOFetchMethod = TokenPairPositionTrackerDOFetchMethod[methodName as keyof typeof TokenPairPositionTrackerDOFetchMethod];
        if (method == null) {
            throw new Error(`Unknown method ${method}`);
        }
        return [method,jsonBody];
    }

    assertIsInitialized() {
        if (!this.initialized) {
            throw new Error("Must initialized before using");
        }
    }

    async handleInitialize(initializeRequest : TokenPairPositionTrackerInitializeRequest) : Promise<Response> {
        this.token = initializeRequest.token;
        this.vsToken = initializeRequest.vsToken;
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
        this.manuallyClosePosition(positionID);
        return new Response();
    }

    async handleRequestNewPosition(request : Request) : Promise<Response> {
        const positionRequest : PositionRequest = await request.json();
        this.fillNewPosition(positionRequest);
        return new Response();
    }

    // this should not block 
    async fillNewPosition(positionRequest : PositionRequest) : Promise<Response> {

        // mark position as pending open (unfilled)
        const newID = crypto.randomUUID();
        this.unfilledPositions.set(newID, positionRequest);

        /* These steps are async and should not block execution of any new acceptNewPosition or updatePrice ticks */
        this.fillPosition(positionRequest);

        return new Response();
    }

    async fillPosition(positionRequest : PositionRequest) {
        // send swap to exchange, on resolve send to callbacks
    }

    async callbackSuccessFillingPosition(response : Response, userID : number, positionID : string) {
        // move from unfilledPositions to newOpenPositions
        const positionRequest = this.unfilledPositions.get(positionID)!!;
        this.unfilledPositions.delete(positionID);
        const position : Position = {
            userID: userID, // TODO
            positionID : positionRequest.positionID,
            type: positionRequest.type,
            status : PositionStatus.Open,
            tokenAddress : positionRequest.tokenAddress,
            vsTokenAddress : positionRequest.vsTokenAddress,
            tokenAmt : 0.0, // TODO
            highestFillPrice : 0.0, // TODO
            token : '', // TODO
            vsToken: '', // TODO
            vsTokenValue : 0.0 // TODO
        }
        this.newOpenPositions.set(positionID, position);
        this.notifyUserDOFilledPosition(position); // parallel
    }

    async callbackFailureFillingPosition(response : Response, positionID : string) {
        // remove from unfilledPositions queue
        const positionRequest = this.unfilledPositions.get(positionID);
        this.unfilledPositions.delete(positionID);
        // notify user (TODO: how?)
        if (positionRequest) {
            this.notifyUserOfFailureToFill(positionRequest); // async
        }
    }

    async notifyUserOfFailureToFill(positionRequest : PositionRequest) {

    }

    manuallyClosePosition(positionID : string) {

        // if the order hasn't gone to the exchange yet, no worries! Just remove it from the queue!
        if (this.unfilledPositions.has(positionID)) {
            this.unfilledPositions.delete(positionID);
        }

        // if it has been filled but isn't in the data structure, send to closing queue and ask exchange to close it
        const newOpenPosition = this.newOpenPositions.get(positionID)
        if (newOpenPosition) {
            this.newOpenPositions.delete(positionID);
            newOpenPosition.status = PositionStatus.Closing;
            this.closingPositions.set(positionID, newOpenPosition);
            this.sendOrdersToClosePosition([newOpenPosition]);
        }

        // if it is in the datastructure, fetch it and put it in the closing queue, and ask the exchange to close it.
        const openPosition = this.openPositions.get(positionID);
        if (openPosition) {
            this.openPositions.delete(positionID);
            openPosition.status = PositionStatus.Closing; // setting status prevents data structure from attempting to close again
            this.closingPositions.set(positionID, openPosition);
            this.sendOrdersToClosePosition([openPosition]);
        }

    }

    async sendOrdersToClosePosition(positions : Position[]) {
        // add callbacks to callbackSuccessClosePositions and callbackFailureClosePositions
    }

    async updatePrice(newPrice : number) {
        /* 1. Incorporate new open positions since last tick into price data structures */
        /* 2. Update price data structures with new price */
        /* 3. Collect trades to execute, execute them.    */
        /* 4. (callbacks in event of failure cases handled elsewhere) */

        // incorporate new trades into data structures - do this before anything else!
        this.importNewlyOpenedPositionsIntoDataStructures();

        // update price peaks
        this.updatePriceDataStructuresWithNewPrice(newPrice);

        // collect positions to close (one method per type)
        const positionsToClose = this.collectLongTrailingStopLossesToClose(newPrice);
        
        // mark them as closing and move to closing queue
        for (const positionToClose of positionsToClose) {
            positionToClose.status = PositionStatus.Closing;
            this.openPositions.delete(positionToClose.positionID);
            this.closingPositions.set(positionToClose.positionID, positionToClose);
        }

        // ASYNC: send async batch call to swap triggered positions back to pair token
        this.sendOrdersToClosePosition(positionsToClose);
    }

    importNewlyOpenedPositionsIntoDataStructures() {
        for (const [positionID,openPosition] of this.newOpenPositions) {
            // if multiple fill prices used due to slippage, use highest
            const fillPrice = openPosition.highestFillPrice; 
            if (!this.pricePeaks.has(fillPrice)) {
                this.pricePeaks.set(fillPrice, [openPosition]);
            }
            else {
                this.pricePeaks.get(fillPrice)!!.push(openPosition);
            }
        }
        this.newOpenPositions.clear();
    }    

    updatePriceDataStructuresWithNewPrice(newPrice : number) {
        this.updatePeakPricesDataStructure(newPrice);
    }

    updatePeakPricesDataStructure(newPrice : number) {

        // Create a new price datastructure by building it from scratch.
        const newPricePeaks = new Map<number,Position[]>();

        // For each unique current highest price...
        for (const [peakPrice,positionsWithThisPeakPrice] of this.pricePeaks.entries()) {

            // Determine if that highest price needs to be updated, and to what
            const newPeakPrice = (peakPrice < newPrice) ? newPrice : peakPrice;

            // If so, transfer the list of positions to that new peak price
            if (!newPricePeaks.has(newPeakPrice)) {
                newPricePeaks.set(newPeakPrice, positionsWithThisPeakPrice);
            }
            else {
                newPricePeaks.get(newPeakPrice)!!.push(...positionsWithThisPeakPrice);
            }
        }

        this.pricePeaks = newPricePeaks;
    }

    collectLongTrailingStopLossesToClose(newPrice : number) : Position[] {
        const positionsToClose = [];
        for (const peakPrice of this.pricePeaks.keys()) {
            // TODO: arbitrary precision arithmetic?
            const priceDecreaseFrac = (peakPrice - newPrice) / peakPrice;
            const positionsWithThisPeakPrice = this.pricePeaks.get(peakPrice)!!;
            for (const position of positionsWithThisPeakPrice) {
                // If it is not an open, long trailing stop loss, continue.
                const isOpenPosition = position.status === PositionStatus.Open; // this is super critical.
                if (!isOpenPosition) {
                    continue;
                }
                if (this.isLongTrailingStopLossPosition(position)) {
                    // And the newPrice doesn't trigger the selloff of the position, continue.
                    const tradeIsTriggered = priceDecreaseFrac >= position.triggerPercent;
                    if (!tradeIsTriggered) {
                        continue;
                    }
                    // And add it to the list of positions to close
                    positionsToClose.push(position);
                }
            }
        }
        return positionsToClose;
    }

    isLongTrailingStopLossPosition(position : Position) : position is LongTrailingStopLossPosition {
        return position.type == PositionType.LongTrailingStopLoss;
    }

    async closePositions(positions : Position[]) {
        // this is done asynchronously to avoid blocking next updatePrice ticks or blocking acceptNewOrder
        this.sendOrdersToClosePosition(positions);
    }

    async callbackSuccessClosePositions(positions : Position[]) {
        for (const position of positions) {
            this.closingPositions.delete(position.positionID);
            this.closedPositions.set(position.positionID, position);
            this.notifyUserDOClosedPosition(position); // parallel
        }
    }

    async callbackFailureClosePositions(positions : Position[]) {
        // TODO: what to do here?
    }

    async notifyUserDOFilledPosition(position : Position) {
        await this.jsonCallUserDO(position.userID, position, "notifyFilledPosition")
    }

    async notifyUserDOClosedPosition(position : Position) {
        await this.jsonCallUserDO(position.userID, position, "notifyClosedPosition");
    }

    async jsonCallUserDO<T>(userID : number, body : T, method : string) {
        const request = makeJSONRequest(`http://userDO/${method}`, body);
        const response = await fetch(request);
        // TODO: what if fails?
    }
}