// TODO: how to discard pending calls to updatePrice
// TODO: partial fills on buy and sell - how to handle?
// TODO: persist to R2 or more permanent thingy for legal record
// TODO: proper logging
// TODO: sockets implementation for price streaming
// TODO: 'failsafe from scratch load'
// TODO: incorporate async write to persistent storage

const web3 = require('@solana/web3.js');

const POSITION_TYPES = Object.freeze({
    LONG_TRAILING_STOP_LOSS: "LONG_TRAILING_STOP_LOSS"
});

const POSITION_STATUS = Object.freeze({
    UNFILLED: "UNFILLED",
    OPEN: "OPEN",
    CLOSING: "CLOSING",
    CLOSED: "CLOSED"
});

/* Durable Object storing all open positions for a single token pair.  Triggers appropriate actions when price updates. */
export class PositionTrackerDO {

    constructor(state, env) {
        this.state               = state;     // access to persistent storage (as opposed to in-memory)
        this.token               = token;     // address of token being traded
        this.pairToken           = pairToken; // i.e.; USDC or SOL

        /* Queues */
        this.unfilledPositions   = new Map();  // positions sent to exchange, but not yet filled. {ID->Position}.
        this.newOpenPositions    = new Map();  // positions open, but not yet incorporated into datastructures. {ID->Position}.
        this.openPositions       = new Map();  // positions open, incorporated into datastructure.  Refers to same object in datastructure by ref.
        this.closingPositions    = new Map();  // positions that will be closed
        this.closedPositions     = new Map();  // positions that are confirmed closed

        /* Data Structures */
        this.pricePeaks          = new Map(); // {PeakPrice->List[Open Positions With This Peak Price]}
        
        /* RPC connection */
        this.rpc_endpoint_url = env.RPC_ENDPOINT_URL;

    }

    async fetch(request) {
        let url = new URL(request.url);
        const method = url.pathname.toLowerCase();
        switch(method) {
            case '/updateprice':
                return this.handleUpdatePrice(request);
                break;
            case '/manuallycloseposition':
                return this.handleManuallyClosePosition(request);
                break;
            case '/fillnewposition':
                return this.handleFillNewPosition(request);
                break;
            default:
                throw new Error(`Unknown method ${method}`);
        }
    }

    handleUpdatePrice(request) {
        const body = request.json();
        const newPrice = body.price;
        this.updatePrice(newPrice);
        return new Response();
    }

    handleManuallyClosePosition(request) {
        const body = request.json();
        const positionID = body.positionID;
        this.manuallyClosePosition(positionID);
        return new Response();
    }

    handleFillNewPosition(request) {
        const body = request.json();
        const position = {
            id: crypto.randomUUID(),
            vsTokenAmount: body.vsTokenAmount,
            type: body.type,
            status: POSITION_STATUS.UNFILLED
        };
        this.fillNewPosition(position);
        return new Response();
    }

    // this should not block 
    fillNewPosition(position) {

        // mark position as pending open (unfilled)
        position.status = POSITION_STATUS.UNFILLED;
        this.unfilledPositions[position.id] = position;

        /* These steps are async and should not block execution of any new acceptNewPosition or updatePrice ticks */
        this.fillPosition(position) // async call
            .then(this.callbackSuccessFillingPosition) // async callback
            .catch(this.callbackFailureFillingPosition); // async callback

        return new Response();
    }

    async fillPosition(position) {
        // send swap to exchange, on resolve send to callbacks
    }

    async callbackSuccessFillingPosition(positionID) {
        // move from unfilledPositions to newOpenPositions
        const position = this.unfilledPositions[positionID];
        this.unfilledPositions.delete(positionID);
        this.newOpenPositions[positionID] = position;
    }

    async callbackFailureFillingPosition(positionID) {
        // remove from unfilledPositions queue
        const position = this.unfilledPositions[positionID];
        this.unfilledPositions.delete(positionID);
        // notify user
        this.notifyUserOfFailureToFill(position); // async
    }

    notifyUserOfFailureToFill(position) {

    }

    manuallyClosePosition(positionID) {

        // if the order hasn't gone to the exchange yet, no worries! Just remove it from the queue!
        if (this.unfilledPositions.has(positionID)) {
            this.unfilledPositions.delete(positionID);
        }

        // if it has been filled but isn't in the data structure, send to closing queue and ask exchange to close it
        if (this.newOpenPositions.has(positionID)) {
            const position = this.newOpenPositions[positionID];
            this.newOpenPositions.delete(positionID);
            position.status = POSITION_STATUS.CLOSING;
            this.closingPositions[positionID] = position;
            this.sendOrdersToClosePosition([position])
                .then(this.callbackSuccessClosePositions)
                .catch(this.callbackFailureClosePositions)
        }

        // if it is in the datastructure, fetch it and put it in the closing queue, and ask the exchange to close it.
        if (this.openPositions.has(positionID)) {
            const position = this.openPositions[positionID];
            this.openPositions.delete(positionID);
            position.status = POSITION_STATUS.CLOSING; // setting status prevents data structure from attempting to close again
            this.closingPositions[positionID] = position;
            this.sendOrdersToClosePosition([position])
                .then(this.callbackSuccessClosePositions)
                .catch(this.callbackFailureClosePositions)
        }
    }

    async updatePrice(newPrice) {
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
            positionToClose.status = POSITION_STATUS.CLOSING;
            this.openPositions.delete(positionID);
            this.closingPositions[positionID] = positionToClose;
        }

        // ASYNC: send async batch call to swap triggered positions back to pair token
        this.sendOrdersToClosePositions(positionsToClose)
            .then(this.callbackSuccessClosePositions)
            .catch(this.callbackFailureClosePositions);
    }

    importNewlyOpenedPositionsIntoDataStructures() {
        for (const [positionID,openPosition] of this.newOpenPositions) {
            // if multiple fill prices used due to slippage, use highest
            const fillPrice = openPosition.highestFillPrice; 
            if (!this.peakPrices.has(fillPrice)) {
                this.peakPrices[fillPrice] = openPosition;
            }
            else {
                this.peakPrices[fillPrice].append(openPosition);
            }
        }
        this.openPositions.clear();
    }    

    updatePriceDataStructuresWithNewPrice(newPrice) {
        this.updatePeakPricesDataStructure(newPrice);
    }

    updatePeakPricesDataStructure(newPrice) {

        // Create a new price datastructure by building it from scratch.
        const newPricePeaks = new Map();

        // For each unique current highest price...
        for (const [peakPrice,positionsWithThisPeakPrice] of this.peakPrices.keys()) {

            // Determine if that highest price needs to be updated, and to what
            const newPeakPrice = (peakPrice < newPrice) ? newPrice : peakPrice;

            // If so, transfer the list of positions to that new peak price
            if (!newPricePeaks.has(newPeakPrice)) {
                newPricePeaks[newPeakPrice] = positionsWithThisPeakPrice;
            }
            else {
                newPricePeaks[newPeakPrice].push(...positionsWithThisPeakPrice);
            }
        }

        this.pricePeaks = newPricePeaks;
    }

    collectLongTrailingStopLossesToClose(newPrice) {
        const positionsToClose = [];
        for (const peakPrice of this.peakPrices) {
            // TODO: arbitrary precision arithmetic?
            const priceDecreaseFrac = (peakPrice - newPrice) / peakPrice;
            const positionsWithThisPeakPrice = this.pricePeaks[peakPrice];
            for (const position of positionsWithThisPeakPrice) {
                // If it is not an open, long trailing stop loss, continue.
                const isLongTrailingStopLoss = position.type === POSITION_TYPES.LONG_TRAILING_STOP_LOSS;
                const isOpenPosition = position.status === POSITION_STATUS.OPEN; // this is super critical.
                if (!isLongTrailingStopLoss || !isOpenPosition) {
                    continue;
                }
                // And the newPrice doesn't trigger the selloff of the position, continue.
                const tradeIsTriggered = priceDecreaseFrac >= position.trigger_percent;
                if (!tradeIsTriggered) {
                    continue;
                }
                // And add it to the list of positions to close
                positionsToClose.push(position);
            }
        }
        return positionsToClose;
    }

    async closePositions(positions) {
        // this is done asynchronously to avoid blocking next updatePrice ticks or blocking acceptNewOrder
        this.sendOrdersToClosePositions(positions)
            .then(this.callbackSuccessClosePositions)
            .catch(this.callbackFailureClosePositions)
    }

    async callbackSuccessClosePositions(positions) {
        for (const position of positions) {
            this.closingPositions.delete(position.id);
            this.closedPositions[position.id] = position;
        }
    }

    async callbackFailureClosePositions(positions) {
        // TODO: what to do here?
    }
}