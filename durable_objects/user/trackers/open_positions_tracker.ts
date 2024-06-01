import { DecimalizedAmount, MATH_DECIMAL_PLACES, dAdd, dCompare, dDiv, dMult, dSub } from "../../../decimalized";
import { dZero, fromNumber, toNumber } from "../../../decimalized/decimalized_amount";
import { Position, PositionStatus, PositionType } from "../../../positions";
import { setDifference, setIntersection, structuralEquals } from "../../../util";
import { PositionAndMaybePNL } from "../../token_pair_position_tracker/model/position_and_PNL";
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

export class OpenPositionsTracker {
    prefix : string = "openPositions";
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
    updatePrice(tokenPair : TokenPair, price : DecimalizedAmount) : UpdatePriceResult {
        const timestamp = Date.now();
        const triggeredTSLPositions : Position[] = [];
        const unconfirmedBuys : Position[] = [];
        // update peak prices
        for (const key of Object.keys(this.positions)) {
            const position = this.positions[key];
            if (this.hasThisTokenPair(position, tokenPair)) {
                position.currentPrice = price;
                position.currentPriceMS = timestamp;
                if (dCompare(price, position.peakPrice) > 0) {
                    position.peakPrice = price;
                }
                if (this.meetsTSLTriggerCondition(price, position)) {
                    triggeredTSLPositions.push(position);
                }
            }
        }
        this.markTriggeredTSLsAsClosing(triggeredTSLPositions);
        return { triggeredTSLPositions: triggeredTSLPositions, unconfirmedBuys: unconfirmedBuys, unconfirmedSells: [] };
    }
    clear() {
        for (const key in this.positions) {
            if (this.positions.hasOwnProperty(key)) {
                delete this.positions[key];
            }
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
            delete this.positions[key];
            return pos;
        }
        return undefined;
    }
    reactivatePosition(position : Position) {
        // i'm not setting closing as open here because we want to maybe trigger a sell confirmation
        const key = new PKey(this.prefix, position.positionID).toString();
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
            }
        }
    }
    upsertPosition(position : Position) {
        this.positions[new PKey(this.prefix, position.positionID).toString()] = position;
    }
    insertPosition(position : Position) : boolean {
        const key = new PKey(this.prefix, position.positionID).toString();
        // insert does not permit overwrites
        if (key in this.positions) {
            return false;
        }
        else {
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
        await storage.put(puts);
        await storage.delete(deletes);
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
    private hasThisTokenPair(position : Position, tokenPair : TokenPair) : boolean {
        return position.token.address == tokenPair.tokenAddress && position.vsToken.address === tokenPair.vsTokenAddress;
    }
    private meetsTSLTriggerCondition(price : DecimalizedAmount, position : Position) {
        if (!position.buyConfirmed) {
            return false;
        }
        if (position.type !== PositionType.LongTrailingStopLoss) {
            return false;
        }
        if (position.status !== PositionStatus.Open) {
            return false;
        }
        const pctBelowPeak = 100 * toNumber(dDiv(dSub(price, position.peakPrice), position.peakPrice, MATH_DECIMAL_PLACES) || dZero());
        if (pctBelowPeak > position.triggerPercent) {
            return true;
        }
    }
    private markTriggeredTSLsAsClosing(positions : Position[]) {
        for (const position of positions) {
            this.positions[position.positionID].status = PositionStatus.Closing;
        }
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