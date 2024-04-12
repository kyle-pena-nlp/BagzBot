import { Connection, ParsedTransactionWithMeta } from "@solana/web3.js";
import { Env } from "../../../env";
import { logDebug, logError } from "../../../logging";
import { Position } from "../../../positions";
import { parseParsedTransactionWithMeta } from "../../../rpc/rpc_parse";
import { ParsedSuccessfulSwapSummary, ParsedSwapSummary, UnknownTransactionParseSummary, isFrozenTokenAccountSwapExecutionErrorParseSummary, isInsufficientNativeTokensSwapExecutionErrorParseSummary, isOtherKindOfSwapExecutionError, isSlippageSwapExecutionErrorParseSummary, isSuccessfulSwapSummary, isTokenFeeAccountNotInitializedSwapExecutionErrorParseSummary } from "../../../rpc/rpc_swap_parse_result_types";
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
    async confirmSell(position : Position & { sellConfirmed : false }) : Promise<
        'api-error'|
        'tx-was-dropped'|
        'slippage-failed'|
        'other-failed'|
        'unconfirmed'|
        'token-fee-account-not-initialized'|
        'frozen-token-account'|
        'insufficient-sol'|
        ParsedSuccessfulSwapSummary> {

        if (this.isTimedOut()) {
            return 'unconfirmed';
        }

        if (position.txSellSignature == null) {
            return 'other-failed';
        }

        if (position.sellLastValidBlockheight == null) {
            return 'other-failed';
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

    private async attemptConfirmation(unconfirmedPosition : Position & { sellConfirmed : false }, blockheight : number) : Promise<
        ParsedSuccessfulSwapSummary|
        'tx-was-dropped'|
        'slippage-failed'|
        'other-failed'|
        'unconfirmed'|
        'frozen-token-account'|
        'token-fee-account-not-initialized'|
        'insufficient-sol'> {
        
        const parsedTx = await this.getParsedTransaction(unconfirmedPosition);
        
        // if we couldn't find the TX
        if (parsedTx === 'tx-DNE') {
            // and the blockhash was finalized (as determined via blockheight)
            if (blockheight > unconfirmedPosition.sellLastValidBlockheight!!) {
                // the tx never happened.
                return 'tx-was-dropped';
            }
            else {
                // otherwise, who knows? we have to try again later.
                return 'unconfirmed';
            }
        }
        else if (parsedTx === 'api-error') {
            return 'unconfirmed';
        }
        else if (isSlippageSwapExecutionErrorParseSummary(parsedTx)) {
            return 'slippage-failed';
        }
        else if (isFrozenTokenAccountSwapExecutionErrorParseSummary(parsedTx)) {
            return 'frozen-token-account';
        }
        else if (isInsufficientNativeTokensSwapExecutionErrorParseSummary(parsedTx)) {
            return 'insufficient-sol';
        }
        else if (isTokenFeeAccountNotInitializedSwapExecutionErrorParseSummary(parsedTx)) {
            return 'token-fee-account-not-initialized';
        }
        else if (isOtherKindOfSwapExecutionError(parsedTx)) {
            return 'other-failed';
        }
        else if (isSuccessfulSwapSummary(parsedTx)) {
            return parsedTx;
        }
        else {
            assertNever(parsedTx);
        }
    }    

    private async getParsedTransaction(position : Position) : Promise<'api-error'|'tx-DNE'|Exclude<ParsedSwapSummary,UnknownTransactionParseSummary>> {
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