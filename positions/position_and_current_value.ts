import { DecimalizedAmount } from "../decimalized";
import { Position } from "./position";

export interface PositionAndCurrentValue {
    position : Position
    currentValue : DecimalizedAmount
}

export interface JustPosition {
    position : Position
}

export type PositionAndMaybeCurrentValue = PositionAndCurrentValue | JustPosition;