import {  LongTrailingStopLossPositionRequest } from "./common";

export function renderTrailingStopLossRequestMarkdown(trailingStopLossRequest : LongTrailingStopLossPositionRequest) {
    return `<b>Token</b>: ${trailingStopLossRequest.token}
<b>Buying With</b>: ${trailingStopLossRequest.vsToken}
<b>Quantity</b>: ${trailingStopLossRequest.vsTokenAmt} ${trailingStopLossRequest.vsToken}
<b>Auto-Sell Trigger Percent</b>: ${trailingStopLossRequest.triggerPercent}%`
}