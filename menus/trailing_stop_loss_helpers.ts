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
            `<b>AUTO-SELL</b> when ${positionRequest.token.symbol} price dips <b>${positionRequest.triggerPercent}%</b> from position's peak price`,
            `Buying <b>${toFriendlyString(quote.outTokenAmt, SIG_FIGS)} ${positionRequest.token.symbol}</b> with <b>${toFriendlyString(quote.inTokenAmt, SIG_FIGS)} ${positionRequest.vsToken.symbol}</b>`,
            `<b>Estimated Price Impact</b>: ${quote.priceImpactPct}%`,
            `<b>Estimated ${quote.feeToken.symbol} fees</b>: ${toFriendlyString(quote.fee,4)}`,
            `<b>Estimated Bagz Bot Fees</b>: ${toFriendlyString(quote.botFee, 4)} ${quote.botFeeToken.symbol} (${quote.platformFeeBps/100.0}%)`
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