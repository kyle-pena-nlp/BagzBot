import { PublicKey, Signer, VersionedTransaction } from "@solana/web3.js";
import * as bs58 from "bs58";
import { Wallet, decryptPrivateKey } from "../crypto";
import { Env } from "../env";
import { TransactionPreparationFailure, isTransactionPreparationFailure } from "./rpc_types";

export async function signTransaction(swapTransaction : Buffer|TransactionPreparationFailure, wallet : Wallet, userID : number, env : Env) : Promise<VersionedTransaction|TransactionPreparationFailure> {
    if (isTransactionPreparationFailure(swapTransaction)) {
        return swapTransaction;
    }
    try {
        var transaction = VersionedTransaction.deserialize(swapTransaction);
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

export function signatureOf(signedTx : VersionedTransaction) : string {
    return bs58.encode(signedTx.signatures[0]);
}

