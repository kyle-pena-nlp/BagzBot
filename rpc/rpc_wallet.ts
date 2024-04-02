import { Connection, PublicKey } from "@solana/web3.js";
import { Env, getRPCUrl } from "../env";

export async function getSOLBalance(address : string, env: Env, connection ?: Connection) {
    connection = new Connection(getRPCUrl(env));
    const balance = await connection.getBalance(new PublicKey(address));
    return balance;
}