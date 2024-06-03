import { DecimalizedAmount, MATH_DECIMAL_PLACES, dAdd, dCompare, dDiv, dMult, dSub } from "../../../decimalized";
import { dZero, fromNumber, toNumber } from "../../../decimalized/decimalized_amount";
import { Env } from "../../../env";
import { Position, PositionStatus, PositionType } from "../../../positions";
import { SetWithKeyFn, setDifference, setIntersection, strictParseInt, structuralEquals } from "../../../util";
import { PositionAndMaybePNL } from "../../token_pair_position_tracker/model/position_and_PNL";
import { AutomaticActions } from "../model/automatic_actions";
import { TokenPair } from "../model/token_pair";
import { UserPNL } from "../model/user_data";

export interface UpdatePriceResult {
    triggeredTSLPositions : Position[]
    unconfirmedBuys : Position[]
    unconfirmedSells : Position[] // TODO: this stuff
}

export interface ListPositionFlags {
    includeOpen: boolean
    includeClosing : boolean
    includeUnconfirmed: boolean
    includeClosed : boolean /* These won't exist here, but just for completeness I've included the flag */
}

export interface UpdatePriceParams {
    tokenPair : TokenPair
    price : DecimalizedAmount
    currentPriceMS : number
    markTriggeredAsClosing : true
    markUnconfirmedBuysAsConfirming : true
    markUnconfirmedSellsAsConfirming : true
}

export class OpenPositionsTracker {
    prefix : string = "openPositionsTracker";
    positions : Record<string,Position> = {};
    _buffer : Record<string,Position> = {};
    constructor() {
    }
    has(positionID : string) {
        const key = new PKey(this.prefix, positionID).toString();
        return key in this.positions;
    }
    get(positionID : string) : Position|undefined {
        const key = new PKey(this.prefix, positionID).toString();
        if (!(key in this.positions)) {
            return undefined;
        }
        const position = this.positions[key];
        return position;
    }
    getOpenConfirmedPosition(positionID : string) : Position|undefined {
        const position = this.get(positionID);
        if (position == null) {
            return undefined;
        }
        if (!position.buyConfirmed) {
            return undefined;
        }
        if (position.status !== PositionStatus.Open) {
            return undefined;
        }
        return position;
    }
    updatePrice(params : UpdatePriceParams, env : Env) : AutomaticActions {

        const automaticActions = new AutomaticActions();

        // update peak prices, gather triggered / unconfirmed buys / unconfirmed sells
        for (const key of Object.keys(this.positions)) {
            
            const position = this.positions[key];

            // if the token pair matches
            if (this.isThisTokenPair(position, params.tokenPair)) {
                
                // update price tracking on the position
                this.updatePositionPriceTracking(position, params.price, params.currentPriceMS);
                
                // if it's a TSL, trigger it
                if (this.canBeTriggeredAndMeetsTSLTriggerCondition(params.price, position)) {
                    if (params.markTriggeredAsClosing) {
                        position.status = PositionStatus.Closing;
                        position.txSellAttemptTimeMS = Date.now(); // hack to prevent the sell confirmer from firing off
                    }
                    automaticActions.add('automatic-sell', position);
                }

                // if it's an unconfirmed buy, confirm it
                if (this.isStaleUnconfirmedBuy(position, env)) {
                    if (params.markUnconfirmedBuysAsConfirming) {
                        position.buyConfirming = true;
                    }
                    automaticActions.add('unconfirmed-buy', position);
                }

                // if it's an unconfirmed sell, confirm it
                if (this.isStaleUnconfirmedSell(position, env)) {
                    if (params.markUnconfirmedSellsAsConfirming) {
                        position.sellConfirming = true;
                    }
                    automaticActions.add('unconfirmed-sell', position);
                }
            }
        }

        return automaticActions;
    }
    isStaleUnconfirmedBuy(position: Position, env : Env) : boolean {
        if (position.buyConfirmed) {
            return false;
        }
        if (position.buyConfirming) {
            return false;
        }
        if (position.status === PositionStatus.Closed || position.status === PositionStatus.Closing) {
            return false; // should never happen, but just in case
        }
        const elapsedTimeMS = Date.now() - position.txBuyAttemptTimeMS;
        if (elapsedTimeMS > strictParseInt(env.TX_TIMEOUT_MS) * 1.25) {
            return true;
        }
        return false;
    }
    isStaleUnconfirmedSell(position : Position, env : Env) : boolean {
        if (position.status !== PositionStatus.Closing) {
            return false;
        }
        if (position.sellConfirmed) {
            return false;
        }
        if (position.sellConfirming) {
            return false;
        }
        const elapsedTimeMS = Date.now() - (position.txSellAttemptTimeMS||0);
        if (elapsedTimeMS > strictParseInt(env.TX_TIMEOUT_MS) * 1.25) {
            return true;
        }
        return false;
    }
    clear() {
        for (const key of Object.keys(this.positions)) {
            if (this.positions.hasOwnProperty(key)) {
                delete this.positions[key];
            }
        }
    }
    private updatePositionPriceTracking(position : Position, price : DecimalizedAmount, currentPriceMS : number) {
        position.currentPrice = price;
        position.currentPriceMS = currentPriceMS;
        if (dCompare(price, position.peakPrice) > 0) {
            position.peakPrice = price;
        }
    }
    getOpenPnL() : DecimalizedAmount {
        let total = dZero();
        for (const key of Object.keys(this.positions)) {
            const position = this.positions[key];
            if (position.buyConfirmed && position.status !== PositionStatus.Closed) {
                const PnL = dSub(position.currentPrice, position.fillPrice);
                total = dAdd(total, PnL);
            }
        }
        return total;
    }
    markBuyAsConfirmedAndReturn(positionID : string) : Position|undefined {
        const key = new PKey(this.prefix, positionID).toString();
        if (key in this.positions) {
            this.positions[key].buyConfirmed = true;
            return this.positions[key];
        }
        return undefined;
    }
    markAsClosedAndReturn(positionID : string) : Position|undefined {
        const key = new PKey(this.prefix, positionID).toString();
        if (key in this.positions) {
            this.positions[key].status = PositionStatus.Closed;
            const pos = this.positions[key];
            delete this.positions[key];
            return pos;
        }
        return undefined;
    }
    markAsOpenAndReturn(positionID : string) : Position|undefined {
        const key = new PKey(this.prefix, positionID).toString();
        if (key in this.positions) {
            this.positions[key].status = PositionStatus.Open;
            return this.positions[key];
        }
        return undefined;
    }
    deactivateAndReturn(positionID : string) : Position|undefined {
        const key = new PKey(this.prefix, positionID).toString();
        if (key in this.positions) {
            //we don't want to do this. we want to try to confirm the sell upon reactivation, so we keep as closing.
            //this.positions[key].status = PositionStatus.Open;
            const pos = this.positions[key];
            if (!pos.buyConfirmed) {
                return undefined; // can't deactivate unconfirmed position
            }
            if (pos.status === PositionStatus.Closed) {
                return undefined; // can't deactivate closed position
            }
            delete this.positions[key];
            return pos;
        }
        return undefined;
    }
    reactivatePosition(position : Position, currentPrice : DecimalizedAmount, currentPriceMS : number) {
        // i'm not setting closing as open here because we want to maybe trigger a sell confirmation
        const key = new PKey(this.prefix, position.positionID).toString();
        position.otherSellFailureCount = 0;
        this.updatePositionPriceTracking(position, currentPrice, currentPriceMS);
        this.positions[key] = position;
    }
    listOpenConfirmedPositions() {
        const positions : Position[] = [];
        for (const key of Object.keys(this.positions)) {
            const pos = this.positions[key];
            if (pos.buyConfirmed && pos.status == PositionStatus.Open) {
                positions.push(this.positions[key]);
            }
        }
        positions.sort(p => p.fillPriceMS);
        return positions;
    }
    listPositions(flags : ListPositionFlags) : Position[] {
        const positions : Position[] = [];
        for (const key of Object.keys(this.positions)) {
            const position = this.positions[key];
            if (!position.buyConfirmed && !flags.includeUnconfirmed) {
                continue;
            }
            if (position.status === PositionStatus.Open && !flags.includeOpen) {
                continue;
            }
            if (position.status === PositionStatus.Closing && !flags.includeClosing) {
                continue;
            }
            if (position.status === PositionStatus.Closed && !flags.includeClosed) {
                // there shouldn't be any closed ones in here anyway
                continue;
            }
            positions.push(position);
        }
        positions.sort(p => p.fillPriceMS);
        return positions;
    }
    listUniqueTokenPairs(flags: ListPositionFlags) : TokenPair[] {
        const uniqueTokenPairs = new SetWithKeyFn<TokenPair>([], tp => {
            return `${tp.tokenAddress}:${tp.vsTokenAddress}`;
        });
        const positions = this.listPositions(flags);
        for (const position of positions) {
            uniqueTokenPairs.add({ tokenAddress : position.token.address, vsTokenAddress: position.vsToken.address });
        }
        return [...uniqueTokenPairs];
    }
    getProperty<T extends Exclude<any,undefined>>(positionID : string, accessor : (position : Position) => T) : T|undefined {
        const key = new PKey(this.prefix, positionID).toString();
        if (key in this.positions) {
            const position = this.positions[key];
            return accessor(position);
        }
        return undefined;
    }
    mutateOpenConfirmedPosition(positionID : string, action: (position : Position) => void) : Position|undefined {
        const key = new PKey(this.prefix, positionID).toString();
        const position = this.get(positionID);
        if (position == null || !position.buyConfirmed || position.status !== PositionStatus.Open) {
            return undefined;
        }
        else {
            return this.mutatePosition(positionID, action);
        }
    }
    mutatePosition(positionID : string, action: (position : Position) => void) : Position|undefined {
        const key = new PKey(this.prefix, positionID).toString();
        if (key in this.positions) {
            const position = this.positions[key];
            action(position);
            return position;
        }
        return undefined;
    }
    initialize(entries : Map<string,any>) {
        for (const [key,value] of entries) {
            if (this.matchesPrefix(key)) {
                this.positions[key] = value;
                this._buffer[key] = value;
            }
        }
        this.overwriteBufferWithCurrentState();
    }
    insertPosition(position : Position, currentPrice : DecimalizedAmount, currentPriceMS : number) : boolean {
        const key = new PKey(this.prefix, position.positionID).toString();
        // insert does not permit overwrites
        if (key in this.positions) {
            return false;
        }
        else {
            this.updatePositionPriceTracking(position, currentPrice, currentPriceMS);
            this.positions[key] = position;
            return true;
        }
    }
    deletePosition(positionID : string) : boolean {
        const key = new PKey(this.prefix, positionID).toString();
        if (key in this.positions) {
            delete this.positions[key];
            return true;
        }
        return false;
    }
    async flushToStorage(storage : DurableObjectStorage) {
        const [puts,deletes] = this.gen_diff();
        await Promise.allSettled([storage.put(puts),storage.delete(deletes)])
            .then(() => {
                this.overwriteBufferWithCurrentState();
            });
    }
    overwriteBufferWithCurrentState() {
        this._buffer = {};
        for (const key of Object.keys(this.positions)) {
            if (this.positions.hasOwnProperty(key)) {
                this._buffer[key] = structuredClone(this.positions[key]);
            }
        }
    }
    private matchesPrefix(key : string) : boolean {
        return key.startsWith(`${this.prefix}:`);
    }
    private gen_diff() : [Record<string,Position>,string[]] {
        const currentKeys = new Set<string>(Object.keys(this.positions));
        const bufferKeys = new Set<string>(Object.keys(this._buffer));
        const putKeys = setDifference(currentKeys, bufferKeys, Set<string>);
        const deleteKeys = setDifference(bufferKeys, currentKeys, Set<string>);
        const commonKeys = setIntersection(currentKeys, bufferKeys, Set<string>);
        const changedValueKeys = new Set<string>();

        for (const commonKey of commonKeys) {
            const newValue = this.positions[commonKey];
            const oldValue = this._buffer[commonKey];
            if (!structuralEquals(newValue, oldValue)) {
                changedValueKeys.add(commonKey);
            }
        }
        const putEntries : Record<string,Position> = {};
        for (const putKey of putKeys) {
            putEntries[putKey] = this.positions[putKey];
        }
        for (const changedValueKey of changedValueKeys) {
            putEntries[changedValueKey] = this.positions[changedValueKey];
        }
        return [putEntries,[...deleteKeys]];
    }
    private isThisTokenPair(position : Position, tokenPair : TokenPair) : boolean {
        return position.token.address == tokenPair.tokenAddress && position.vsToken.address === tokenPair.vsTokenAddress;
    }
    private canBeTriggeredAndMeetsTSLTriggerCondition(price : DecimalizedAmount, position : Position) : boolean {
        if (!position.buyConfirmed) {
            return false;
        }
        if (position.type !== PositionType.LongTrailingStopLoss) {
            return false;
        }
        if (position.status !== PositionStatus.Open) {
            return false;
        }
        const pctBelowPeak = -100 * toNumber(dDiv(dSub(price, position.peakPrice), position.peakPrice, MATH_DECIMAL_PLACES) || dZero());
        if (pctBelowPeak > position.triggerPercent) {
            return true;
        }
        return false;
    }
    getPositionAndMaybePnL(positionID : string) : PositionAndMaybePNL|undefined {
        const key = new PKey(this.prefix, positionID).toString();
        if (!(key in this.positions)) {
            return undefined;
        }
        const position = this.positions[key];
        const currentPrice = position.currentPrice;
        const peakPrice = position.peakPrice;
        const originalValue = position.vsTokenAmt;
        const currentValue = dMult(currentPrice, position.tokenAmt);
        const fracBelowPeak = dDiv(dSub(peakPrice, currentPrice), peakPrice, MATH_DECIMAL_PLACES);
        const PNL = dSub(currentValue, originalValue);
        const PNLfrac = dDiv(PNL, originalValue, MATH_DECIMAL_PLACES);
        return {
            position : position,
            peakPrice: peakPrice,
            PNL: {
                currentPrice: currentPrice,
                fracBelowPeak: fracBelowPeak || dZero(),
                PNL: PNL,
                PNLfrac: PNLfrac || dZero(),
                currentValue: currentValue                     
            }
        };
    }
    maybeGetUserPnL() : UserPNL|null {
        let PNL = dZero();
        let originalTotalValue = dZero();
        let currentTotalValue = dZero();
        const positions = this.listPositions({ includeUnconfirmed: false, includeOpen: true, includeClosing: true, includeClosed : false });
        for (const position of positions) {
            const positionWithPNL = this.getPositionAndMaybePnL(position.positionID);
            if (positionWithPNL == null) {
                continue;
            }
            if (positionWithPNL.PNL == null) {
                return null;
            }
            originalTotalValue = dAdd(originalTotalValue, positionWithPNL.position.vsTokenAmt);
            currentTotalValue = dAdd(currentTotalValue, positionWithPNL.PNL.currentValue);
            PNL = dAdd(PNL, positionWithPNL.PNL.PNL)
        }
        
        const PNLpercent = dDiv(dMult(PNL, fromNumber(100)), originalTotalValue, MATH_DECIMAL_PLACES);
        const result = {
            originalTotalValue: originalTotalValue,
            currentTotalValue: currentTotalValue,
            PNL: PNL,
            PNLpercent: PNLpercent||dZero()
        }
        return result;
    }
}


class PKey {
    prefix : string;
    positionID : string;
    constructor(prefix : string, positionID : string) {
        this.prefix = prefix;
        this.positionID = positionID;
    }
    toString() {
        return `${this.prefix}:${this.positionID}`;
    }
}