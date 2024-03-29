import { DecimalizedAmount } from "../decimalized";
import { Position } from "./position";

export interface PositionAndCurrentValue {
    position : Position
    pricePeak : DecimalizedAmount
    currentPrice : DecimalizedAmount
    pctBelowPeak : number
    currentValue : DecimalizedAmount
    PNL : DecimalizedAmount
}

export interface JustPosition {
    position : Position
}

export type PositionAndMaybeCurrentValue = PositionAndCurrentValue | JustPosition;