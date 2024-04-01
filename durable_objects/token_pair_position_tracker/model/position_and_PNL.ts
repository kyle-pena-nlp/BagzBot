import { DecimalizedAmount } from "../../../decimalized";
import { Position } from "../../../positions";

export interface PNL {
    currentPrice : DecimalizedAmount
    currentValue : DecimalizedAmount
    fracBelowPeak : DecimalizedAmount
    PNL : DecimalizedAmount
    PNLfrac : DecimalizedAmount
}

export interface PositionAndMaybePNL {
    position : Position,
    peakPrice : DecimalizedAmount
    PNL ?: PNL
}