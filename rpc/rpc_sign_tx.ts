import { PublicKey, Signer, VersionedTransaction } from "@solana/web3.js";
import { TransactionPreparationFailure, isTransactionPreparationFailure } from "./rpc_types";
import { getRecentBlockhash } from "./rpc_common";
import * as bs58 from "bs58";
import { Wallet } from "../crypto/wallet";
import { Env } from "../env";

export async function signTransaction(swapTransaction : Buffer|TransactionPreparationFailure, wallet : Wallet, env : Env) : Promise<VersionedTransaction|TransactionPreparationFailure> {
    if (isTransactionPreparationFailure(swapTransaction)) {
        return swapTransaction;
    }
    try {
        var transaction = VersionedTransaction.deserialize(swapTransaction);
        // TODO: is this needed?
        transaction.message.recentBlockhash = await getRecentBlockhash(env);
        const signer = toSigner(wallet);
        transaction.sign([signer]);
        return transaction;
    }
    catch {
        return TransactionPreparationFailure.FailedToSignTransaction;
    }
}


function toSigner(wallet : Wallet) : Signer {
    const publicKey = new PublicKey(wallet.publicKey);
    const privateKey =  bs58.decode(wallet.privateKey);
    return {
        publicKey : publicKey,
        secretKey : privateKey
    };
}

