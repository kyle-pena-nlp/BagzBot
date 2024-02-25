import {  LongTrailingStopLossPositionRequest } from "./common";

export function renderTrailingStopLossRequestMarkdown(trailingStopLossRequest : LongTrailingStopLossPositionRequest) {
    return `**Token**: ${trailingStopLossRequest.token}
        **Buying With**: ${trailingStopLossRequest.vsToken}
        **Quantity**: ${trailingStopLossRequest.vsTokenAmt} ${trailingStopLossRequest.vsToken}
        **Auto-Sell Trigger Percent**: ${trailingStopLossRequest.triggerPercent}
        *Edit these settings using the menu below.*`
}