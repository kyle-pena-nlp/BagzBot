import { DecimalizedAmount } from "../../../decimalized";
import { Position } from "../../../positions";

export interface PositionAndMaybePNL {
    position : Position,
    peakPrice : DecimalizedAmount
    PNL ?: {
        currentPrice : DecimalizedAmount
        fracBelowPeak : DecimalizedAmount
        PNL : DecimalizedAmount
        PNLfrac : DecimalizedAmount
    }
}