import { Connection, GetVersionedTransactionConfig, ParsedTransactionWithMeta, VersionedTransaction } from "@solana/web3.js";
import * as bs58 from "bs58";
import { Wallet, toUserAddress } from "../../crypto";
import { Env } from "../../env";
import { logDebug, logError } from "../../logging";
import { Swappable } from "../../positions";
import { executeAndConfirmSignedTx } from "../../rpc/rpc_execute_signed_transaction";
import { ParseTransactionParams, parseParsedTransactionWithMeta } from "../../rpc/rpc_parse";
import { ParsedSwapSummary } from "../../rpc/rpc_swap_parse_result_types";
import { TGStatusMessage, UpdateableNotification } from "../../telegram";
import { TokenInfo } from "../../tokens";
import { assertNever, sleep, strictParseInt } from "../../util";

export class SwapExecutor {
    wallet : Wallet
    type : 'buy'|'sell'
    env : Env
    notificationChannel: UpdateableNotification
    connection : Connection
    lastValidBH : number
    startTimeMS : number
    constructor(wallet : Wallet, 
        type : 'buy'|'sell',
        env : Env, 
        notificationChannel : UpdateableNotification, 
        connection : Connection,
        lastValidBH : number,
        startTimeMS : number) {
        this.wallet = wallet;
        this.type = type;
        this.env = env;
        this.notificationChannel = notificationChannel;
        this.connection = connection;
        this.lastValidBH = lastValidBH
        this.startTimeMS = startTimeMS;
    }

    async executeTxAndParseResult(s : Swappable, signedTx : VersionedTransaction) : Promise<'tx-failed'|'unconfirmed'|ParsedSwapSummary> {

        // get some stuff we'll need
        const signature = bs58.encode(signedTx.signatures[0]);
        
        TGStatusMessage.queue(this.notificationChannel, `Executing transaction... (can take a bit)`, false);
        
        let txExecutionStatus = await executeAndConfirmSignedTx(signedTx, this.lastValidBH, this.connection, this.env, this.startTimeMS);

        if (txExecutionStatus === 'failed') {
            return 'tx-failed';
        }
        else if (txExecutionStatus === 'unconfirmed') {
            return 'unconfirmed';
        }
        else if (txExecutionStatus === 'confirmed') {
            const rawParsedTx =  await this.getParsedTx(signature, 3000);
            if (rawParsedTx === 'timed-out') {
                return 'unconfirmed';
            }
            else if ('slot' in rawParsedTx) {
                const inTokenInfo = this.getInTokenInfo(s);
                const outTokenInfo = this.getOutTokenInfo(s);
                const params : ParseTransactionParams = {
                    parsedTransaction: rawParsedTx,
                    inTokenAddress: inTokenInfo.address,
                    inTokenType: inTokenInfo.tokenType,
                    outTokenAddress: outTokenInfo.address,
                    outTokenType: outTokenInfo.tokenType,
                    signature,
                    userAddress: toUserAddress(this.wallet)
                }
                return parseParsedTransactionWithMeta(params, this.env)
            }
            else {
                assertNever(rawParsedTx);
            }
        }
        else {
            assertNever(txExecutionStatus);
        }
    }

    async getParsedTx(signature : string, parseTimeoutMS : number) : Promise<'timed-out'|ParsedTransactionWithMeta> {
        const startParseMS = Date.now();
        let expBackoffFactor = 1.0;
        const increaseExpBackoff = () => {
            expBackoffFactor = Math.min(8, 2 * expBackoffFactor);
        };
        const opts : GetVersionedTransactionConfig = { maxSupportedTransactionVersion: 0, commitment: 'confirmed' };
        const isTimedOut = () => {
            return Date.now() > Math.min(startParseMS + parseTimeoutMS, this.startTimeMS + strictParseInt(this.env.TX_TIMEOUT_MS));
        };
        while (!isTimedOut()) {
            const parsedTransaction = await this.connection.getParsedTransaction(signature, opts)
            .then(tx => tx == null ? 'tx-DNE' : tx)
            .catch(e => {
                if (is429(e)) {
                    logDebug('429 retrieving parsed transaction');
                    increaseExpBackoff();
                    return '429';
                }
                else {
                    logError(e);
                    return 'error';
                }
            });
            if (typeof parsedTransaction !== 'string') {
                return parsedTransaction;
            }
            sleep(expBackoffFactor * 500);
        }
        return 'timed-out';
    }

    getInTokenInfo(s : Swappable) : TokenInfo {
        if (this.type === 'buy') {
            return s.vsToken;
        }
        else if (this.type === 'sell') {
            return s.token;
        }
        else {
            assertNever(this.type);
        }
    }

    getOutTokenInfo(s : Swappable) : TokenInfo {
        if (this.type === 'buy') {
            return s.token;
        }
        else if (this.type === 'sell') {
            return s.vsToken;
        }
        else {
            assertNever(this.type);
        }
    }
}

function is429(e: any) : boolean {
    return (e?.message||'').includes("429");
}


