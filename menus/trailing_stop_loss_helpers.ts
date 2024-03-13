import { toFriendlyString } from "../decimalized/decimalized_amount";
import { PositionRequestAndQuote } from "../positions/position_request_and_quote";
import { isGetQuoteFailure } from "../rpc/rpc_interop";

const SIG_FIGS = 4;

export function renderTrailingStopLossRequestMarkdown(requestAndQuote : PositionRequestAndQuote) {
    const positionRequest = requestAndQuote.positionRequest;
    const quote = requestAndQuote.quote;
    if (isGetQuoteFailure(quote)) {
        return `Could not generate a quote for this ${positionRequest.token.symbol} order.  Try clicking 'Refresh'`
    }
    else {
        const lines = [
            `Buying **${toFriendlyString(quote.outTokenAmt, SIG_FIGS)} ${positionRequest.token.symbol}** with **${toFriendlyString(quote.inTokenAmt, SIG_FIGS)} ${positionRequest.vsToken.symbol}**`,
            `**Estimated Price Impact**: ${quote.priceImpactPct}%`,
            `**Estimated ${quote.feeToken.symbol} fees: ${toFriendlyString(quote.fee,4)}`,
            `**Estimated Bagz Bot Fees: ${toFriendlyString(quote.botFee, 4)} ${quote.botFeeToken.symbol}`
        ];
        return lines.join("\r\n");
    }


    /*
    return `<b>Token</b>: ${positionRequest.token.symbol}
    <b>Buying With</b>: ${positionRequest.vsToken.symbol}
    <b>Quantity</b>: ${positionRequest.vsTokenAmt} ${positionRequest.vsToken.symbol}
    <b>Auto-Sell Trigger Percent</b>: ${positionRequest.triggerPercent}%
    <b>Auto-Retry Sell If Slippage Tolerance Exceeded</b>: ${positionRequest.retrySellIfSlippageExceeded ? 'Yes' : 'No'}`*/
}