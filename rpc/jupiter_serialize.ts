import { deriveFeeAccount } from "../tokens/token_info";
import { SwapRoute } from "./jupiter_types";
import { TransactionPreparationFailure, isTransactionPreparationFailure } from "./rpc_types";
import { makeJSONRequest, tryReadResponseBody } from "../util/http_helpers";
import { Env } from "../env";
import { Buffer } from "node:buffer";

export async function serializeSwapRouteTransaction(swapRoute : SwapRoute|TransactionPreparationFailure, 
    publicKey : string, 
    includeReferralPlatformFee : boolean,
    env : Env) : Promise<Buffer|TransactionPreparationFailure> {
        
    if (isTransactionPreparationFailure(swapRoute)) {
        return swapRoute;
    }
    
    let body : any = {
      quoteResponse: swapRoute.route,
      userPublicKey: publicKey,
      wrapAndUnwrapSol: true,

      computeUnitPriceMicroLamports: "auto"
    };
    if (includeReferralPlatformFee) {
        const feeAccount = await deriveFeeAccount(swapRoute.outTokenAddress, env);
        body.feeAccount = feeAccount.toBase58();
    }
    try {
        const swapRequest = makeJSONRequest(env.JUPITER_SWAP_API_URL, body);
        const swapResponse = await fetch(swapRequest);
        if (!swapResponse.ok) {
            const responseBody = await tryReadResponseBody(swapResponse);
            return TransactionPreparationFailure.FailedToSerializeTransaction;
        }
        const swapRequestResponseJSON : any = await swapResponse.json();
        return Buffer.from(swapRequestResponseJSON.swapTransaction, 'base64'); 
    }
    catch (e) {
        return TransactionPreparationFailure.FailedToSerializeTransaction;
    }
}
