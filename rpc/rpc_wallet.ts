import { Connection, PublicKey } from "@solana/web3.js";
import { Env, getRPCUrl } from "../env";

const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"

export async function getSOLBalance(address : string, env: Env, connection ?: Connection) {
    connection = new Connection(getRPCUrl(env));
    const balance = await connection.getBalance(new PublicKey(address));
    return balance;
}


export async function findNonZeroBalanceTokenAccounts(walletAddress : string, env : Env) : Promise<Set<string>> {
    const connection = new Connection(getRPCUrl(env));
    const walletPublicKey = new PublicKey(walletAddress);

    // Get all token accounts of the wallet
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPublicKey, { programId: new PublicKey(TOKEN_PROGRAM_ID) });

    // Filter accounts with non-zero balance
    const nonZeroTokenAccounts = tokenAccounts.value.filter(account => {
        const accountInfo = account.account.data.parsed.info;
        return accountInfo.tokenAmount.amount > 0;
    });

    return new Set<string>(nonZeroTokenAccounts.map(account => account.account.data.parsed.info.mint as string));
}