import { Buffer } from "node:buffer";
import { Env, getSwapAPIUrl } from "../env";
import { makeJSONRequest, tryReadResponseBody } from "../http";
import { logError } from "../logging";
import { deriveFeeAccount } from "../tokens";
import { strictParseBoolean as parseBoolStrict } from "../util";
import { SwapRoute } from "./jupiter_types";
import { TransactionPreparationFailure, isTransactionPreparationFailure } from "./rpc_types";

export interface SwapOpts {
    includeReferralPlatformFee : boolean
    priorityFeeAutoMultiplier : 'auto'|number|null
}

export async function serializeSwapRouteTransaction(swapRoute : SwapRoute|TransactionPreparationFailure, 
    publicKey : string, 
    opts : SwapOpts,
    env : Env) : Promise<Buffer|TransactionPreparationFailure> {
        
    if (isTransactionPreparationFailure(swapRoute)) {
        return swapRoute;
    }

    const includeReferralPlatformFee = opts.includeReferralPlatformFee;
    const priorityFeeAutoMultiplier = opts.priorityFeeAutoMultiplier;
    
    let body : any = {
      quoteResponse: swapRoute.route,
      userPublicKey: publicKey,
      wrapAndUnwrapSol: true,
      
    };

    // include a multiplier on auto if desired, or just rely on 'auto'
    if (priorityFeeAutoMultiplier === "auto") {
        body.prioritizationFeeLamports = "auto";
    }
    else if (typeof priorityFeeAutoMultiplier === 'number') {
        body.prioritizationFeeLamports = {
            autoMultiplier: priorityFeeAutoMultiplier,
        };
    }
    else {
        // backwards compat behavior for earlier releases of bot
        body.computeUnitPriceMicroLamports = "auto";
    }

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
            logError("Failure generating swap route", responseBody||'');
            return TransactionPreparationFailure.FailedToSerializeTransaction;
        }
        const swapRequestResponseJSON : any = await swapResponse.json();
        return Buffer.from(swapRequestResponseJSON.swapTransaction, 'base64'); 
    }
    catch (e) {
        return TransactionPreparationFailure.FailedToSerializeTransaction;
    }
}
