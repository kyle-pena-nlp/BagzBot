import { Connection } from "@solana/web3.js";
import { Env } from "../env";

export async function getLatestBlockheight(connection : Connection) : Promise<number> {
    return (await connection.getBlockHeight());
}

export async function getLastValidBlockheight(connection : Connection) {
    return (await connection.getLatestBlockhash('confirmed')).lastValidBlockHeight;
}

export async function getRecentBlockhash(env : Env) : Promise<string> {
    const connection = new Connection(env.RPC_ENDPOINT_URL);
    return (await connection.getLatestBlockhash('confirmed')).blockhash;
}
