import { VersionedTransaction } from "@solana/web3.js";
import { Wallet } from "../../crypto";
import { Env } from "../../env";
import { logError } from "../../logging";
import { Swappable, getSwapOfXDescription, isPosition, isPositionRequest } from "../../positions";
import { getBuyTokenSwapRoute, getSellTokenSwapRoute } from "../../rpc/jupiter_quotes";
import { SwapOpts, serializeSwapRouteTransaction } from "../../rpc/jupiter_serialize";
import { SwapRoute } from "../../rpc/jupiter_types";
import { signTransaction } from "../../rpc/rpc_sign_tx";
import { GetQuoteFailure, isGetQuoteFailure, isTransactionPreparationFailure } from "../../rpc/rpc_types";
import { TGStatusMessage, UpdateableNotification } from "../../telegram";
import { assertNever } from "../../util";

export class SwapTransactionSigner {
    wallet : Wallet
    env : Env
    notificationChannel : UpdateableNotification
    constructor(wallet : Wallet, env : Env, notificationChannel : UpdateableNotification) {
        this.wallet = wallet;
        this.env = env;
        this.notificationChannel = notificationChannel;
    }
    async createAndSign(s : Swappable) : Promise<VersionedTransaction|undefined> {

        const forbidden_tokens = this.env.FORBIDDEN_TOKENS.split(",");

        if (forbidden_tokens.includes(s.token.address)) {
            throw new Error(`Cannot swap vsToken ${s.token.address}`);
        }
    
        if (forbidden_tokens.includes(s.vsToken.address)) {
            throw new Error(`Cannot swap vsToken ${s.vsToken.address}`);
        }
    
        // get friendly description of what we are doing
        const swapOfX = getSwapOfXDescription(s);
    
        // get a swap route. if fails, early out.
        const swapRoute = await getSwapRoute(s, this.env).catch(r => null);
        if (swapRoute == null || isGetQuoteFailure(swapRoute)) {
            logError("Failed getting swap route", s, swapRoute);
            TGStatusMessage.queue(this.notificationChannel, `Could not get a quote for ${swapOfX} - purchase failed. Try again soon.`, false);
            return;
        }
        else{
            TGStatusMessage.queue(this.notificationChannel, `Quote found for ${swapOfX}`, false);
        }
    
        // serialize swap route. if fails, early out.
        const txBuffer = await serializeSwapRouteTransaction(swapRoute, this.wallet.publicKey, swapOptsOf(s), this.env).catch(r => null);
        if (txBuffer == null || isTransactionPreparationFailure(txBuffer)) {
            logError("Failed serializing transaction", s, txBuffer);
            TGStatusMessage.queue(this.notificationChannel, `Could not prepare transaction - ${swapOfX} failed.`, false);
            return;
        }
        else {
            TGStatusMessage.queue(this.notificationChannel, `Transaction serialized for ${swapOfX}`, false);
        }
    
        // sign tx. if fails, early out.
        const signedTx = await signTransaction(txBuffer, this.wallet, s.userID, this.env).catch(r => null);
        if (signedTx == null || isTransactionPreparationFailure(signedTx)) {
            logError("Failed signing transaction", s, signedTx);
            TGStatusMessage.queue(this.notificationChannel, `Could not sign transaction - ${swapOfX} failed.`, false);
            return;
        }
        else {
            TGStatusMessage.queue(this.notificationChannel, `Transaction for ${swapOfX} signed.`, false);
        }
    
        return signedTx;
    }
}

function swapOptsOf(s : Swappable) : SwapOpts {
    return {
        includeReferralPlatformFee: shouldIncludeReferralPlatformFee(s),
        priorityFeeAutoMultiplier : maybeGetFeeAutoMultiplier(s)
    }
}

function maybeGetFeeAutoMultiplier(s : Swappable) : 'auto'|number|null {
    if (isPosition(s)) {
        return s.sellPriorityFeeAutoMultiplier;
    }
    else if (isPositionRequest(s)) {
        return s.priorityFeeAutoMultiplier;
    }
    else {
        assertNever(s);
    }
}

function shouldIncludeReferralPlatformFee(s : Swappable) : boolean {
    if (isPosition(s)) {
        return true;
    }
    else if (isPositionRequest(s)) {
        return false;
    }
    else {
        assertNever(s);
    }
}

async function getSwapRoute(s : Swappable, env : Env) : Promise<SwapRoute|GetQuoteFailure> {
    if (isPositionRequest(s)) {
        return getBuyTokenSwapRoute(s, env);
    }
    else if (isPosition(s)) {
        return getSellTokenSwapRoute(s, env);
    }
    else {
        assertNever(s);
    }
}