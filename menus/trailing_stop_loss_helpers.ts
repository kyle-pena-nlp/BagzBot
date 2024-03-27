import { toFriendlyString } from "../decimalized";
import { PositionRequest } from "../positions";
import { isGetQuoteFailure } from "../rpc/rpc_types";

const SIG_FIGS = 4;

export function renderTrailingStopLossRequestMarkdown(positionRequest : PositionRequest) {
    const quote = positionRequest.quote;
    if (isGetQuoteFailure(quote)) {
        return `Could not generate a quote for this ${positionRequest.token.symbol} order.  Try clicking 'Refresh'`;
    }
    else {
        const nonce = Math.floor(Date.now() / 30000) * 30000; // nonce is new only every 30 seconds
        const staleness = Date.now() - nonce;
        const staleSeconds = Math.round(staleness/1000);
        const lines : string[] = [
            `<image href="${positionRequest.token.logoURI}">.</image> <a href="https://birdeye.so/token/${positionRequest.token.address}?chain=solana&v=${nonce}">$${positionRequest.token.symbol}</a> | ${positionRequest.token.name}`,
            //`Preview is ${staleSeconds} seconds old`,
            `<code>${positionRequest.token.address}</code>`,
            `Purchasing ${toFriendlyString(positionRequest.quote.outTokenAmt,4)} $${positionRequest.token.symbol} @ ${toFriendlyString(positionRequest.quote.fillPrice,4)} SOL/$${positionRequest.token.symbol}`,
            `<b>Price Impact</b>: ${positionRequest.quote.priceImpactPct.toFixed(2)}%`
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