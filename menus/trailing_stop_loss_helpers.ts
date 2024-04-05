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
            `:bullet: <b>Token</b>: <a href="${positionRequest.token.logoURI}">\u200B</a> <a href="https://birdeye.so/token/${positionRequest.token.address}?chain=solana&v=${nonce}">$${positionRequest.token.symbol}</a> | ${positionRequest.token.name}`,
            //`Preview is ${staleSeconds} seconds old`,
            `:bullet: <b>Current Price of $${positionRequest.token.symbol}</b>: ${toFriendlyString(positionRequest.quote.fillPrice,4)} SOL/$${positionRequest.token.symbol}`,
            `:bullet: <b>Address</b>: <code>${positionRequest.token.address}</code>`,
            `:bullet: <b>Amount Purchasing</b>: ${toFriendlyString(positionRequest.quote.outTokenAmt,4)} $${positionRequest.token.symbol} (${positionRequest.vsTokenAmt} ${positionRequest.vsToken.symbol})`,
            
            `:bullet: <b>Price Impact</b>: ${positionRequest.quote.priceImpactPct.toFixed(2)}%`
        ];
        return lines.join("\r\n");
    }
}