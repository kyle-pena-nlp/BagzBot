import { PublicKey, Signer, VersionedTransaction } from "@solana/web3.js";
import * as bs58 from "bs58";
import { decryptPrivateKey } from "../crypto/private_keys";
import { Wallet } from "../crypto/wallet";
import { Env } from "../env";
import { getRecentBlockhash } from "./rpc_common";
import { TransactionPreparationFailure, isTransactionPreparationFailure } from "./rpc_types";

export async function signTransaction(swapTransaction : Buffer|TransactionPreparationFailure, wallet : Wallet, userID : number, env : Env) : Promise<VersionedTransaction|TransactionPreparationFailure> {
    if (isTransactionPreparationFailure(swapTransaction)) {
        return swapTransaction;
    }
    try {
        var transaction = VersionedTransaction.deserialize(swapTransaction);
        // TODO: is this needed?
        transaction.message.recentBlockhash = await getRecentBlockhash(env);
        const signer = await toSigner(wallet, userID, env);
        transaction.sign([signer]);
        return transaction;
    }
    catch {
        return TransactionPreparationFailure.FailedToSignTransaction;
    }
}


async function toSigner(wallet : Wallet, userID : number, env : Env) : Promise<Signer> {
    const publicKey = new PublicKey(wallet.publicKey);
    const decryptedPrivateKey = await decryptPrivateKey(wallet.encryptedPrivateKey, userID, env);
    const privateKey =  bs58.decode(decryptedPrivateKey);
    return {
        publicKey : publicKey,
        secretKey : privateKey
    };
}

