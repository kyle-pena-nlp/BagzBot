import { Connection, ParsedTransactionWithMeta } from "@solana/web3.js";
import { Env } from "../../../env";
import { logError } from "../../../logging";
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
    private isTimedOut() : boolean {
        return (Date.now() > this.startTimeMS + strictParseInt(this.env.TX_TIMEOUT_MS));
    }    
    async confirmSell(position : Position & { sellConfirmed : false }) : Promise<'api-error'|'slippage-failed'|'failed'|'unconfirmed'|'confirmed'> {
        if (this.isTimedOut()) {
            return 'unconfirmed';
        }

        const blockheight : number | 'api-call-error' | '429' = await this.connection.getBlockHeight('confirmed').catch(r => {
            logError(r);
            if (is429(r)) {
                return '429';
            }
            else {
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

    private async attemptConfirmation(unconfirmedPosition : Position & { sellConfirmed : false }, blockheight : number) : Promise<'confirmed'|'slippage-failed'|'failed'|'unconfirmed'> {
        
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
        else if (isSlippageSwapExecutionErrorParseSummary(parsedTx)) {
            return 'slippage-failed';
        }
        else if (isNonSlippageExecutionErrorParseSummary(parsedTx)) {
            return 'failed';
        }
        else if (isSuccessfulSwapSummary(parsedTx)) {
            return 'confirmed';
        }
        else {
            assertNever(parsedTx);
        }
    }    

    private async getParsedTransaction(position : Position) : Promise<'api-error'|'tx-DNE'|ParsedSuccessfulSwapSummary|NonSlippageSwapExecutionErrorParseSummary|SlippageSwapExecutionErrorParseSummary> {
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