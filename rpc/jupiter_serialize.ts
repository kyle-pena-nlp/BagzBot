import { Buffer } from "node:buffer";
import { Env, getSwapAPIUrl } from "../env";
import { deriveFeeAccount } from "../tokens";
import { makeJSONRequest, strictParseBoolean as parseBoolStrict, tryReadResponseBody } from "../util";
import { SwapRoute } from "./jupiter_types";
import { TransactionPreparationFailure, isTransactionPreparationFailure } from "./rpc_types";

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
    if (parseBoolStrict(env.JUPITER_USE_DYNAMIC_COMPUTE_UNIT_LIMIT)) {
        body.dynamicComputeUnitLimit = true; 
    }
    if (includeReferralPlatformFee) {
        const feeAccount = await deriveFeeAccount(swapRoute.outTokenAddress, env);
        body.feeAccount = feeAccount.toBase58();
    }
    try {
        const swapRequest = makeJSONRequest(getSwapAPIUrl(env), body);
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
