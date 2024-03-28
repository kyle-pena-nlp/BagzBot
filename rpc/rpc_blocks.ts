import { Connection } from "@solana/web3.js";
import { logError } from "../logging";

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