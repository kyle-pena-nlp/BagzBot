import { PositionRequest } from "../positions/positions";

export function renderTrailingStopLossRequestMarkdown(trailingStopLossRequest : PositionRequest) {
    return `<b>Token</b>: ${trailingStopLossRequest.token}
<b>Buying With</b>: ${trailingStopLossRequest.vsToken}
<b>Quantity</b>: ${trailingStopLossRequest.vsTokenAmt} ${trailingStopLossRequest.vsToken}
<b>Auto-Sell Trigger Percent</b>: ${trailingStopLossRequest.triggerPercent}%
<b>Auto-Retry Sell If Slippage Tolerance Exceeded</b>: ${trailingStopLossRequest.retrySellIfSlippageExceeded ? 'Yes' : 'No'}`
}