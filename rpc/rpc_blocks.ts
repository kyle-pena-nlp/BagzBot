import { Connection } from "@solana/web3.js";
import { Env } from "../env";
import { logError } from "../logging";
import { sleep } from "../util";

export async function waitUntilCurrentBlockFinalized(connection : Connection, env : Env) {
    try {
        const currentSlot = await connection.getSlot('processed');
        let finalizedSlot = await connection.getSlot('finalized');
        while(currentSlot > finalizedSlot) {
            await sleep(2000);
            finalizedSlot = await connection.getSlot('finalized');
        }
        return;
    }
    catch(e) {
        // What else can I do...
        logError("Failed querying slot numbers");
        await sleep(2 * parseInt(env.MAX_BLOCK_FINALIZATION_TIME_MS, 10));
        return;
    }
}