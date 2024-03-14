
import { Connection, VersionedTransaction } from '@solana/web3.js';
import { Position, PositionRequest } from "../positions/positions";
import { Wallet } from "../crypto/wallet";
import { executeRawSignedTransaction } from "./rpc_execute_signed_transaction";
import { GetQuoteFailure, 
    PreparseSwapResult, 
    ParsedSwapSummary, 
    TransactionPreparationFailure, 
    isGetQuoteFailure } from "./rpc_types";
import * as jupiter_quotes from "./jupiter_quotes";
import * as jupiter_serialize from "./jupiter_serialize";
import * as jupiter_parse from "./jupiter_parse";
import * as jupiter_types from "./jupiter_types";
import * as rpc_sign_tx from "./rpc_sign_tx";
import * as rpc_parse from "./rpc_parse";
import { Env } from "../env";

// TODO: re-org this into a class, and have callbacks for different lifecycle elements.

/*
    Some thoughts:
        DONE - Implement retries.
        Split up into smaller methods and interleave code for handling stuff.
        Optimistically add positions and rollback if transaction is not confirmed.

*/

// TODO: careful analysis of failure modes and their mitigations
// TODO: https://solanacookbook.com/guides/retrying-transactions.html#how-rpc-nodes-broadcast-transactions
// specifically: https://solanacookbook.com/guides/retrying-transactions.html#customizing-rebroadcast-logic 
// https://github.com/solana-labs/solana-program-library/blob/ea354ab358021aa08f774e2d4028b33ec56d4180/token/program/src/error.rs#L16


async function getRawSignedTransaction(swapRoute : jupiter_types.SwapRoute|GetQuoteFailure, wallet : Wallet, env : Env) : Promise<VersionedTransaction|GetQuoteFailure|TransactionPreparationFailure> {
    if (isGetQuoteFailure(swapRoute)) {
        return swapRoute;
    }
    return jupiter_serialize.serializeSwapRouteTransaction(swapRoute, wallet.publicKey, env)
        .catch(reason => TransactionPreparationFailure.FailedToSerializeTransaction)
        .then(serializedSwapTransaction => rpc_sign_tx.signTransaction(serializedSwapTransaction, wallet, env))
}