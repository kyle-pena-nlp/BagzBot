import { Connection, PublicKey } from "@solana/web3.js";
import { Env } from "../env";

export async function getSOLBalance(address : string, env: Env, connection ?: Connection) {
    connection = new Connection(env.RPC_ENDPOINT_URL);
    const balance = await connection.getBalance(new PublicKey(address));
    return balance;
}