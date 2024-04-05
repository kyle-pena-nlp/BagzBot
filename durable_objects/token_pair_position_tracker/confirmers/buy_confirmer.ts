import { Connection, ParsedTransactionWithMeta } from "@solana/web3.js";
import { Env } from "../../../env";
import { logDebug, logError } from "../../../logging";
import { Position, PositionStatus } from "../../../positions";
import { parseParsedTransactionWithMeta } from "../../../rpc/rpc_parse";
import { ParsedSuccessfulSwapSummary, SwapExecutionErrorParseSummary, isSuccessfulSwapSummary, isSwapExecutionErrorParseSummary } from "../../../rpc/rpc_types";
import { assertNever, strictParseInt } from "../../../util";


// Does the work of checking the blockchain to see if the buy succeeded.
// Can return 'unconfirmed' when answer is uncertain.
// Can return 'api-error' if API down... is a signal to back off the API calls.
export class BuyConfirmer {
    connection : Connection    
    startTimeMS : number
    env : Env
    constructor(connection : Connection, startTimeMS : number, env : Env) {
        this.connection = connection;
        this.startTimeMS = startTimeMS;
        this.env = env;
    }
    private isTimedOut() : boolean {
        return (Date.now() > this.startTimeMS + strictParseInt(this.env.TX_TIMEOUT_MS));
    }
    async confirmBuy(position : Position & { buyConfirmed: false }) : Promise<'api-error'|'unconfirmed'|'failed'|(Position & { buyConfirmed : true })> {

        if (this.isTimedOut()) {
            return 'unconfirmed';
        }

        const blockheight : number | 'api-call-error' | '429' = await this.connection.getBlockHeight('confirmed').catch(r => {
            logError(r);
            if (is429(r)) {
                logDebug('429 retrieving blockheight');
                return '429';
            }
            else {
                logError(r);
                return 'api-call-error';
            }
        });

        if (blockheight === '429') {
            return 'api-error';
        }
        else if (blockheight === 'api-call-error') {
            return 'api-error';
        }
        else if (typeof blockheight === 'number') {
            return await this.attemptConfirmation(position, blockheight);
        }
        else {
            assertNever(blockheight);
        }
    }

    private async attemptConfirmation(unconfirmedPosition : Position & { buyConfirmed : false }, blockheight : number) : Promise<(Position & { buyConfirmed : true})|'failed'|'unconfirmed'> {
        
        const parsedTx = await this.getParsedTransaction(unconfirmedPosition);
        
        if (parsedTx === 'tx-DNE') {
            if (blockheight > unconfirmedPosition.buyLastValidBlockheight) {
                return 'failed';
            }
            else {
                return 'unconfirmed';
            }
        }
        else if (parsedTx === 'api-error') {
            return 'unconfirmed';
        }
        else if (isSwapExecutionErrorParseSummary(parsedTx)) {
            return 'failed';
        }
        else if (isSuccessfulSwapSummary(parsedTx)) {
            const confirmedPosition = this.convertToConfirmedPosition(unconfirmedPosition, parsedTx);
            return confirmedPosition;
        }
        else {
            assertNever(parsedTx);
        }
    }

    private convertToConfirmedPosition(unconfirmedPosition: Position, parsedSuccessfulSwap : ParsedSuccessfulSwapSummary) : Position & { buyConfirmed : true } {
        const confirmedPosition : Position & { buyConfirmed : true } = {
            userID: unconfirmedPosition.userID,
            chatID : unconfirmedPosition.chatID,
            messageID : unconfirmedPosition.messageID,
            positionID : unconfirmedPosition.positionID,
            userAddress: unconfirmedPosition.userAddress,
            type: unconfirmedPosition.type,
            status: PositionStatus.Open,
    
            buyConfirmed: true, // <-------------
            txBuySignature: unconfirmedPosition.txBuySignature,  
            buyLastValidBlockheight: unconfirmedPosition.buyLastValidBlockheight,        
    
            sellConfirmed: false,
            txSellSignature: null,
            sellLastValidBlockheight: null,
    
            token: unconfirmedPosition.token,
            vsToken: unconfirmedPosition.vsToken,
            sellSlippagePercent: unconfirmedPosition.sellSlippagePercent,
            triggerPercent : unconfirmedPosition.triggerPercent,
            sellAutoDoubleSlippage : unconfirmedPosition.sellAutoDoubleSlippage,
        
            vsTokenAmt : unconfirmedPosition.vsTokenAmt,
            tokenAmt: parsedSuccessfulSwap.swapSummary.outTokenAmt,        
            fillPrice: parsedSuccessfulSwap.swapSummary.fillPrice,
            fillPriceMS : parsedSuccessfulSwap.swapSummary.swapTimeMS,
            netPNL: null // to be set on sell
        };
        return confirmedPosition;
    }

    private async getParsedTransaction(position : Position) : Promise<'api-error'|'tx-DNE'|ParsedSuccessfulSwapSummary|SwapExecutionErrorParseSummary> {
        const parsedTransaction : 'api-error'|ParsedTransactionWithMeta|null = await this.connection.getParsedTransaction(position.txBuySignature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        }).catch(e => {
            if (is429(e)) {
                return 'api-error';
            }
            else {
                logError(e);
                return 'api-error';
            }
        });

        if (parsedTransaction === 'api-error') {
            return 'api-error';
        }
        else if (parsedTransaction == null) {
            return 'tx-DNE';
        }
        else if ('meta' in parsedTransaction) {
            const inTokenAddress = position.vsToken.address;
            const outTokenAddress = position.token.address;
            return parseParsedTransactionWithMeta(parsedTransaction, inTokenAddress, outTokenAddress, position.txBuySignature, position.userAddress, this.env);
        }
        else {
            assertNever(parsedTransaction);
        }
    }
}

function is429(e : any) {
    return (e?.message||'').includes('429');
}