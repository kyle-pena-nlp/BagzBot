import { PositionRequest } from "../positions/positions";

export function renderTrailingStopLossRequestMarkdown(trailingStopLossRequest : PositionRequest) {
    return `<b>Token</b>: ${trailingStopLossRequest.token.symbol}
<b>Buying With</b>: ${trailingStopLossRequest.vsToken.symbol}
<b>Quantity</b>: ${trailingStopLossRequest.vsTokenAmt} ${trailingStopLossRequest.vsToken.symbol}
<b>Auto-Sell Trigger Percent</b>: ${trailingStopLossRequest.triggerPercent}%
<b>Auto-Retry Sell If Slippage Tolerance Exceeded</b>: ${trailingStopLossRequest.retrySellIfSlippageExceeded ? 'Yes' : 'No'}`
}