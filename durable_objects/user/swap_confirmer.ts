import { Connection, ParsedTransactionWithMeta } from "@solana/web3.js";
import { Wallet, toUserAddress } from "../../crypto";
import { Env, getRPCUrl } from "../../env";
import { logError, logInfo } from "../../logging";
import { Position } from "../../positions";
import { parseSwappableParsedTransactionWithMeta } from "../../rpc/rpc_parse";
import { isSlippageSwapExecutionErrorParseSummary, isSwapExecutionErrorParseSummary } from "../../rpc/rpc_types";
import { sleep, strictParseInt } from "../../util";
import { SwapStatus } from "./model/swap_status";

export class SwapConfirmer {
    wallet : Wallet
    env : Env
    startTimeMS : number
    reattemptConfirmDelay : number
    constructor(wallet : Wallet, env : Env, startTimeMS : number) {
        this.wallet = wallet;
        this.env = env;
        this.startTimeMS = startTimeMS;
        this.reattemptConfirmDelay = parseInt(env.RPC_REATTEMPT_CONFIRM_DELAY, 10);
    }
    private isTimedOut() : boolean {
        return (Date.now() - this.startTimeMS) > strictParseInt(this.env.TX_TIMEOUT_MS);
    }
    async confirmSwap(s : Position, type : 'buy'|'sell') : Promise<SwapStatus> {
        
        let exceptionCount = 0;
        const connection = new Connection(getRPCUrl(this.env));
        
        while(true) {

            // out of time? early out. this together with sleep(...) makes the while(true) less scary.
            if (this.isTimedOut()) {
                logInfo(`timed out on confirm for ${type} for ${s.positionID}`);
                return 'unconfirmed';
            }

            // get the signature of the tx to confirm. early out if no sig stored.
            const signature = type === 'buy' ? s.txBuySignature : s.txSellSignature;
            if (signature == null) {
                logError(`null signature on confirm ${type} for ${s.positionID}`);
                return 'unconfirmed';
            }

            // TODO: store lastValidBlockheight with position. early out if no lastvalidBH stored.
            const lastValidBH = { 'buy': s.buyLastValidBlockheight, 'sell': s.sellLastValidBlockheight }[type]
            if (lastValidBH == null) {
                logError(`null lastValidBH on confirm ${type} for ${s.positionID}`);
                return 'unconfirmed';
            }
            
            // get current BH.  early out if API call failed.
            const blockheight : 'blockheight-api-failed' | number = await connection.getBlockHeight('confirmed').catch(r => 'blockheight-api-failed');
            if (blockheight === 'blockheight-api-failed') {
                logError(`Could not retrieve blockheight`);
                return 'unconfirmed';
            }

            // See if the current blockheight expired.  This affects logic going forward.
            const blockheightExpired = blockheight > lastValidBH;            

            // try to get the tx from the rpc
            const maybeParsedTransaction : 'failed-api-call'|'missing'|ParsedTransactionWithMeta = await connection.getParsedTransaction(signature, {
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed'
            }).then(t => {
                return t == null ? 'missing' : t;
            }).catch(r => {
                logError(r);
                return 'failed-api-call';
            });
            
            if (maybeParsedTransaction === 'failed-api-call') {
                exceptionCount += 1;
            }
            // the tx failed if the blockheight expired and the tx still doesn't exist
            else if (maybeParsedTransaction === 'missing') {
                if (blockheightExpired) { 
                    return 'failed'; // no tx, blockheight expired := tx was dropped := tx failed.
                }
            }
            else {
                // we can parse the transaction
                const parsed = parseSwappableParsedTransactionWithMeta(s, maybeParsedTransaction, type, toUserAddress(this.wallet), this.env);
                if (parsed == null) {
                    return 'unconfirmed';
                }
                else if (isSwapExecutionErrorParseSummary(parsed)) {
                    return 'failed';
                }
                else if (isSlippageSwapExecutionErrorParseSummary(parsed)) {
                    return 'slippage-failed';
                }
                else {
                    return 'confirmed';
                }
            }

            if (exceptionCount > 10) {
                return 'unconfirmed';
            }

            sleep(this.reattemptConfirmDelay);
        }
    }
}