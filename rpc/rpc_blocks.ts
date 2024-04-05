import { Connection } from "@solana/web3.js";
import { logDebug, logError } from "../logging";

export async function getLatestValidBlockhash(connection : Connection, max_retries : number) : Promise<number|null> {
    let lastValidBH = null;
    let attempts = 0;
    let expBackoffFactor = 1.0;
    while (lastValidBH == null && attempts < max_retries) {
        lastValidBH = await connection.getLatestBlockhash('confirmed')
        .then(x => x.lastValidBlockHeight)
        .catch(r => {
            if ((r.message||'').includes("429")) {
                logDebug('429 retrieving parsed transaction');
                if (expBackoffFactor < 8) {
                    expBackoffFactor = 2.0 * expBackoffFactor;
                }
            }
            else {
                logError(`Could not get latestBlockhash`, r);
            }
            return null;
        });
        attempts += 1;
    }
    return lastValidBH;
}

export async function waitUntilCurrentBlockFinalized(connection : Connection, lastValidBlockheight ?: number) {
    if (lastValidBlockheight == null) {
        const latestBlockhash = await connection.getLatestBlockhash('confirmed');  
        lastValidBlockheight = latestBlockhash.lastValidBlockHeight;
    }

    let reattempt = true;
    let rpcExceptionCount = 0;
    while (reattempt) {
        let blockheight = await connection.getBlockHeight('confirmed').catch(r => {
            logError("Could not poll blockheight");
            return null;
        });
        if (blockheight == null) {
            rpcExceptionCount += 1;
        }
        if (rpcExceptionCount > 10) {
            reattempt = false;
        }
        if (blockheight != null) {
            reattempt = blockheight <= lastValidBlockheight;
        }
    }
}