import { Connection, ParsedTransactionWithMeta } from "@solana/web3.js";
import { Env } from "../../../env";
import { logDebug, logError } from "../../../logging";
import { Position } from "../../../positions";
import { parseParsedTransactionWithMeta } from "../../../rpc/rpc_parse";
import { NonSlippageSwapExecutionErrorParseSummary, ParsedSuccessfulSwapSummary, SlippageSwapExecutionErrorParseSummary, isNonSlippageExecutionErrorParseSummary, isSlippageSwapExecutionErrorParseSummary, isSuccessfulSwapSummary } from "../../../rpc/rpc_types";
import { assertNever, strictParseInt } from "../../../util";

export class SellConfirmer {
    connection : Connection
    startTimeMS : number
    env : Env
    constructor(connection : Connection, startTimeMS : number, env : Env) {
        this.connection = connection;
        this.startTimeMS = startTimeMS;
        this.env = env;
    }
    isTimedOut() : boolean {
        return (Date.now() > this.startTimeMS + strictParseInt(this.env.CONFIRM_TIMEOUT_MS));
    }    
    async confirmSell(position : Position & { sellConfirmed : false }) : Promise<'api-error'|'slippage-failed'|'failed'|'unconfirmed'|ParsedSuccessfulSwapSummary> {

        if (this.isTimedOut()) {
            return 'unconfirmed';
        }

        if (position.txSellSignature == null) {
            return 'failed';
        }

        if (position.sellLastValidBlockheight == null) {
            return 'failed';
        }      

        const blockheight : number | 'api-call-error' | '429' = await this.connection.getBlockHeight('confirmed').catch(r => {
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

    private async attemptConfirmation(unconfirmedPosition : Position & { sellConfirmed : false }, blockheight : number) : Promise<ParsedSuccessfulSwapSummary|'slippage-failed'|'failed'|'unconfirmed'> {
        
        const parsedTx = await this.getParsedTransaction(unconfirmedPosition);
        
        if (parsedTx === 'tx-DNE') {
            if (blockheight > unconfirmedPosition.sellLastValidBlockheight!!) {
                return 'failed';
            }
            else {
                return 'unconfirmed';
            }
        }
        else if (parsedTx === 'api-error') {
            return 'unconfirmed';
        }
        else if (isSlippageSwapExecutionErrorParseSummary(parsedTx)) {
            return 'slippage-failed';
        }
        else if (isNonSlippageExecutionErrorParseSummary(parsedTx)) {
            return 'failed';
        }
        else if (isSuccessfulSwapSummary(parsedTx)) {
            return parsedTx;
        }
        else {
            assertNever(parsedTx);
        }
    }    

    private async getParsedTransaction(position : Position) : Promise<'api-error'|'tx-DNE'|ParsedSuccessfulSwapSummary|NonSlippageSwapExecutionErrorParseSummary|SlippageSwapExecutionErrorParseSummary> {
        const parsedTransaction : 'api-error'|ParsedTransactionWithMeta|null = await this.connection.getParsedTransaction(position.txSellSignature!!, {
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
            const inTokenAddress = position.token.address;
            const outTokenAddress = position.vsToken.address;
            return parseParsedTransactionWithMeta(parsedTransaction, inTokenAddress, outTokenAddress, position.txSellSignature!!, position.userAddress, this.env);
        }
        else {
            assertNever(parsedTransaction);
        }
    }    
}

function is429(e : any) {
    return (e?.message||'').includes('429');
}