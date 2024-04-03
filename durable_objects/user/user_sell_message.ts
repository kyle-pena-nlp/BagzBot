import { asTokenPrice } from "../../decimalized/decimalized_amount";
import { Env } from "../../env";
import { MenuRetryManualSell } from "../../menus";
import { Position } from "../../positions";
import { TGStatusMessage, UpdateableNotification } from "../../telegram";
import { assertNever } from "../../util";


export type SellResult = 'already-sold'|'failed'|'slippage-failed'|'unconfirmed'|'confirmed';

export async function publishFinalSellMessage(position : Position, type : 'Sell'|'Auto-sell', status : SellResult, chatID : number, channel : UpdateableNotification, env : Env) {
    const finalSellMessage = getFinalSellMessage(position, type, status);
    TGStatusMessage.queue(channel, finalSellMessage, true);
    await TGStatusMessage.finalize(channel);
    if (type === 'Sell' && (status !== 'confirmed' && status !== 'unconfirmed')) {
        const requestSellDialogueRequest = new MenuRetryManualSell({ status: status, positionID : position.positionID }).getCreateNewMenuRequest(chatID, env);
        await fetch(requestSellDialogueRequest);
    }
}

function getFinalSellMessage(position : Position, type : 'Sell'|'Auto-sell', status : SellResult) : string {
    const Sale = type;
    const symbol = `$${position.token.symbol}`;
    const amount = asTokenPrice(position.tokenAmt);
    const maybeRetry = type === 'Auto-sell' ? 'Sale will be retried automatically.' : '';
    const maybeRetrySlippage = type === 'Auto-sell' ? getAutoSellSlippageRetryMessage(position) : '';
    switch(status) {
        case 'confirmed':
            return `${Sale} of ${amount} ${symbol} successful!`;;
        case 'failed':
            return `${Sale} of ${amount} ${symbol} failed. ${maybeRetry}`;
        case 'slippage-failed':
            return `${Sale} of ${amount} ${symbol} failed due to slippage. ${maybeRetrySlippage}`;
        case 'unconfirmed':
            return `${Sale} of ${amount} ${symbol} could not be confirmed due to network congestion.  We will retry confirmation soon.`;
        case  'already-sold':
            return `${Sale} of ${amount} ${symbol} has already occurred!`;
        default:
            assertNever(status);
    }
}

function getAutoSellSlippageRetryMessage(position : Position) : string {
    if (position.sellAutoDoubleSlippage) {
        return `Sale will be retried with doubled slippage, up to a maximum of 100%`;
    }
    else {
        return ``;
    }
}

