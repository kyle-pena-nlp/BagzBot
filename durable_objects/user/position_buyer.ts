
import { Connection, SimulateTransactionConfig, VersionedTransaction } from "@solana/web3.js";
import { UserAddress, Wallet, toUserAddress } from "../../crypto";
import { fromNumber } from "../../decimalized";
import { Env, getRPCUrl } from "../../env";
import { MenuCode } from "../../menus";
import { Position, PositionRequest, PositionStatus } from "../../positions";
import { getLatestValidBlockhash } from "../../rpc/rpc_blocks";
import { parseInstructionError } from "../../rpc/rpc_parse_instruction_error";
import { signatureOf } from "../../rpc/rpc_sign_tx";
import { ParsedSuccessfulSwapSummary, SwapExecutionError, isFrozenTokenAccountSwapExecutionErrorParseSummary, isInsufficientNativeTokensSwapExecutionErrorParseSummary, isOtherKindOfSwapExecutionError, isSlippageSwapExecutionErrorParseSummary, isSuccessfulSwapSummary, isTokenFeeAccountNotInitializedSwapExecutionErrorParseSummary, isUnknownTransactionParseSummary } from "../../rpc/rpc_swap_parse_result_types";
import { TGStatusMessage, UpdateableNotification } from "../../telegram";
import { assertNever, strictParseBoolean } from "../../util";
import { insertPosition, positionExistsInTracker, removePosition, updatePosition } from "../token_pair_position_tracker/token_pair_position_tracker_do_interop";
import { SwapExecutor } from "./swap_executor";
import { SwapTransactionSigner } from "./swap_transaction_signer";

export class PositionBuyer {
    wallet : Wallet
    env : Env
    startTimeMS : number
    channel : UpdateableNotification
    constructor(wallet : Wallet, 
        env : Env,  
        startTimeMS : number,
        channel : UpdateableNotification) {
        this.wallet = wallet;
        this.env = env;
        this.startTimeMS = startTimeMS;
        this.channel = channel;
    }

    async buy(positionRequest : PositionRequest) : Promise<void> {
        try {
            const finalStatus = await this.buyInternal(positionRequest);
            const finalMessage = this.getFinalStatusMessage(finalStatus);
            const finalMenuCode = this.getFinalMenuCode(finalStatus);
            TGStatusMessage.queue(this.channel, 
                finalMessage, 
                finalMenuCode, 
                positionRequest.positionID);
        }
        catch {
            TGStatusMessage.queue(this.channel, 'There was an unexpected error with this purchase', MenuCode.TrailingStopLossRequestReturnToEditorMenu, positionRequest.positionID);
        }
        finally {
            await TGStatusMessage.finalize(this.channel);
        }
    }

    // Lots of different kinds of things can go wrong. Hence the nasty return type.
    async buyInternal(positionRequest : PositionRequest) : Promise<
        'tx-sim-failed-other'|
        'tx-sim-frozen-token-account'|
        'tx-sim-failed-slippage'|
        'tx-sim-insufficient-sol'|
        'tx-sim-failed-token-account-fee-not-initialized'|
        'already-processed'|
        'could-not-create-tx'|
        'failed'|
        'slippage-failed'|
        'insufficient-sol'|
        'frozen-token-account'|
        'token-fee-account-not-initialized'|
        'unconfirmed'|
        'confirmed'> {

        // RPC connection
        const connection = new Connection(getRPCUrl(this.env));

        // idempotency
        if (await positionExistsInTracker(positionRequest.positionID, positionRequest.token.address, positionRequest.vsToken.address, this.env)) {
            return 'already-processed';
        }

        // get signed tx (signed does not mean executed, per se)
        const signedTx = await this.createSignedTx(positionRequest, this.channel);

        // if failed to get signedTx, early out.
        if (signedTx == null) {
            TGStatusMessage.queue(this.channel, `Unable to sign transaction.`, true);
            return 'could-not-create-tx';
        }

        if (strictParseBoolean(this.env.TX_SIM_BEFORE_BUY)) {
            const txSimResult = await this.simulateTx(signedTx, connection);
            if (txSimResult !== 'success') {
                return txSimResult;
            }
        }

        // get latest valid BH (tells us how long to keep trying to send tx)
        let lastValidBH = await getLatestValidBlockhash(connection, 3);

        // if failed, can't proceed.
        if (lastValidBH == null) {
            TGStatusMessage.queue(this.channel, `Unable to complete transaction due to high trade volume.`, true);
            return 'could-not-create-tx';
        }

        // import position into the tracker as unconfirmed.
        // edge-case: trigger condition met between here and tx execution.
        // can we back-date tracker activity? this is tricky.  to be revisited.
        const unconfirmedPosition = this.convertRequestToUnconfirmedPosition(positionRequest, signatureOf(signedTx), lastValidBH);
        const insertPositionResponse = await insertPosition(unconfirmedPosition, this.env);
        if(!insertPositionResponse.success) {
            return 'could-not-create-tx'; // TODO: more appropriate code.
        }

        // try to do the swap.
        const result = await this.executeAndParseSwap(positionRequest, signedTx, lastValidBH, connection);

        // no guarantees that anything after this point executes... CF may drop it.

        if (result === 'failed' || result === 'slippage-failed' || result === 'insufficient-sol' || result === 'frozen-token-account' || result === 'token-fee-account-not-initialized') {
            await removePosition(positionRequest.positionID, positionRequest.token.address, positionRequest.vsToken.address, this.env);
            return result;
        }
        else if (result === 'unconfirmed') {
            return result;
        }
        else if ('confirmedPosition' in result) {
            const { confirmedPosition } = result;
            await updatePosition(confirmedPosition, this.env);
            return 'confirmed';
        }
        else {
            assertNever(result);
        }
    }

    private async simulateTx(signedTx : VersionedTransaction, connection : Connection) : Promise<'success'|'tx-sim-failed-other'|'tx-sim-insufficient-sol'|'tx-sim-failed-slippage'|'tx-sim-frozen-token-account'|'tx-sim-failed-token-account-fee-not-initialized'> {
        const config: SimulateTransactionConfig = {
            sigVerify: true, // use the signature of the signedTx to verify validity of tx, rather than fetching a new blockhash
            commitment: 'confirmed' // omitting this seems to cause simulation to fail.
        };
        const response = await connection.simulateTransaction(signedTx, config);
        // TODO: we can use response + config to get detailed tx info, better than quote.

        if (!response.value.err) {
            return 'success';
        }

        const swapExecutionError =  parseInstructionError(response.value.err, this.env);

        if (swapExecutionError === SwapExecutionError.InsufficientSOLBalance) {
            return 'tx-sim-insufficient-sol';
        }
        else if (swapExecutionError === SwapExecutionError.SlippageToleranceExceeded) {
            return 'tx-sim-failed-slippage';
        }
        else if (swapExecutionError === SwapExecutionError.TokenAccountFeeNotInitialized) {
            return 'tx-sim-failed-token-account-fee-not-initialized';
        }
        else if (swapExecutionError === SwapExecutionError.FrozenTokenAccount) {
            return 'tx-sim-frozen-token-account';
        }
        else if (swapExecutionError === SwapExecutionError.OtherSwapExecutionError) {
            return 'tx-sim-failed-other';
        }        
        else {
            assertNever(swapExecutionError);
        }        
    }

    private convertRequestToUnconfirmedPosition(positionRequest : PositionRequest, signature : string, lastValidBH : number) : Position & { buyConfirmed: false } {
        
        const autoDoubleFeatureSwitchOff = !strictParseBoolean(this.env.ALLOW_CHOOSE_AUTO_DOUBLE_SLIPPAGE);
        const autoDouble = autoDoubleFeatureSwitchOff ? false : positionRequest.sellAutoDoubleSlippage;
        
        const position : Position & { buyConfirmed : false } = {
            userID: positionRequest.userID,
            chatID : positionRequest.chatID,
            messageID : positionRequest.messageID,
            positionID : positionRequest.positionID,
            type: positionRequest.positionType,
            status: PositionStatus.Open,
            userAddress: toUserAddress(this.wallet),
    
            buyConfirmed: false, // <----------
            txBuyAttemptTimeMS: Date.now(),
            txBuySignature: signature,
            buyLastValidBlockheight: lastValidBH,
            
            sellConfirmed: false,
            txSellSignature: null,
            txSellAttemptTimeMS: null,
            sellLastValidBlockheight: null,
    
            token: positionRequest.token,
            vsToken: positionRequest.vsToken,
            vsTokenAmt : fromNumber(positionRequest.vsTokenAmt), // don't use the quote, it includes fees.
            tokenAmt: positionRequest.quote.outTokenAmt,
    
            sellSlippagePercent: positionRequest.slippagePercent,
            triggerPercent : positionRequest.triggerPercent,
            sellAutoDoubleSlippage : autoDouble,
            fillPrice: positionRequest.quote.fillPrice,
            fillPriceMS : positionRequest.quote.quoteTimeMS,
            netPNL: null, // to be set when position is closed
            otherSellFailureCount: 0
        };
        return position;
    }

    private async createSignedTx(positionRequest : PositionRequest, notificationChannel : UpdateableNotification) {
        const swapTxSigner = new SwapTransactionSigner(this.wallet, this.env, notificationChannel);
        const signedTx = await swapTxSigner.createAndSign(positionRequest);
        return signedTx;
    }

    private async executeAndParseSwap(positionRequest: PositionRequest, signedTx : VersionedTransaction, lastValidBH : number, connection : Connection) : Promise<
        'insufficient-sol'|
        'token-fee-account-not-initialized'|
        'frozen-token-account'|
        'slippage-failed'|
        'failed'|
        'unconfirmed'|{ confirmedPosition: Position & { buyConfirmed : true } }> {
        
        // create a time-limited tx executor and confirmer
        const swapExecutor = new SwapExecutor(this.wallet, 'buy', this.env, this.channel, connection, lastValidBH, this.startTimeMS);

        // attempt to execute, confirm, and parse w/in time limit
        const parsedSwapSummary = await swapExecutor.executeTxAndParseResult(positionRequest, signedTx);

        // convert the tx execution result to a position, if possible
 
        if (parsedSwapSummary === 'tx-failed') {
            return 'failed';
        }
        else if (parsedSwapSummary === 'unconfirmed') {
            return 'unconfirmed';
        }
        else if (isUnknownTransactionParseSummary(parsedSwapSummary)) {
            return 'unconfirmed';
        }
        else if (isSlippageSwapExecutionErrorParseSummary(parsedSwapSummary)) {
            return 'slippage-failed';
        }
        else if (isFrozenTokenAccountSwapExecutionErrorParseSummary(parsedSwapSummary)) {
            return 'frozen-token-account';
        }
        // catch all for other errors
        else if (isOtherKindOfSwapExecutionError(parsedSwapSummary)) {
            return 'failed';
        }
        else if (isInsufficientNativeTokensSwapExecutionErrorParseSummary(parsedSwapSummary)) {
            return 'insufficient-sol';
        }
        else if (isTokenFeeAccountNotInitializedSwapExecutionErrorParseSummary(parsedSwapSummary)) {
            return 'token-fee-account-not-initialized';
        }
        else if (isSuccessfulSwapSummary(parsedSwapSummary)) {
            const confirmedPosition = await this.makeConfirmedPositionFromSwapResult(positionRequest, signatureOf(signedTx), lastValidBH, parsedSwapSummary);
            return { confirmedPosition };
        }
        else {
            assertNever(parsedSwapSummary);
        }
    }

    private async makeConfirmedPositionFromSwapResult(
        positionRequest : PositionRequest, 
        signature : string,
        lastValidBH: number,
        successfulSwapParsed : ParsedSuccessfulSwapSummary) : Promise<Position & { buyConfirmed : true }> {
        
        const newPosition = convertToConfirmedPosition(positionRequest, 
            signature, 
            lastValidBH, 
            toUserAddress(this.wallet), 
            successfulSwapParsed);

        // has or has not been set depending on above logic.
        return newPosition;
    }
    
    private getFinalStatusMessage(status: 'tx-sim-failed-other'|
    'tx-sim-frozen-token-account'|
    'tx-sim-failed-slippage'|
    'tx-sim-insufficient-sol'|
    'tx-sim-failed-token-account-fee-not-initialized'|
    'already-processed'|
    'could-not-create-tx'|
    'failed'|
    'slippage-failed'|
    'insufficient-sol'|
    'frozen-token-account'|
    'token-fee-account-not-initialized'|
    'unconfirmed'|
    'confirmed') : string {
        switch(status) {
            
            case 'already-processed':
                return 'This purchase was already completed.';
            
            case 'could-not-create-tx':
                return 'This purchase failed.';
            
            case 'confirmed':
                return 'Purchase was successful!';
            
            case 'failed':
                return 'This purchase failed. You may wish to try again in a few minutes.';
            
            case 'tx-sim-failed-other':
                return 'This purchase failed. You may wish to try again in a few minutes.';

            case 'tx-sim-insufficient-sol':                
            case 'insufficient-sol':
                return 'This purchase failed because of insufficient SOL in your wallet. Check you wallet balance and try again!';            
            
            case 'tx-sim-failed-token-account-fee-not-initialized':
            case 'token-fee-account-not-initialized':
                return 'There was an error with our platform. Please try again soon.';

            case 'tx-sim-frozen-token-account':
            case 'frozen-token-account':
                return 'This token has been frozen due to suspicious activity! Please try a different token.';

            case 'tx-sim-failed-slippage': 
            case 'slippage-failed':
                return 'Purchase failed due to slippage tolerance exceeded.';
            
            case 'unconfirmed':
                return 'Purchase could not be confirmed due to network congestion.  We will reattempt to confirm the purchase in a bit.';
            default:
                assertNever(status);
        }
    }

    private getFinalMenuCode(status: 'tx-sim-failed-other'|
    'tx-sim-frozen-token-account'|
    'tx-sim-failed-slippage'|
    'tx-sim-insufficient-sol'|
    'tx-sim-failed-token-account-fee-not-initialized'|
    'already-processed'|
    'could-not-create-tx'|
    'failed'|
    'slippage-failed'|
    'insufficient-sol'|
    'frozen-token-account'|
    'token-fee-account-not-initialized'|
    'unconfirmed'|
    'confirmed') : MenuCode {
        switch(status) {
            case 'already-processed':
                return MenuCode.Main;
            
            case 'could-not-create-tx':
                return MenuCode.TrailingStopLossRequestReturnToEditorMenu;
            
            case 'confirmed':
                return MenuCode.ViewOpenPosition;
            
            case 'failed':
                return MenuCode.TrailingStopLossRequestReturnToEditorMenu;
            
            case 'tx-sim-failed-slippage':
            case 'slippage-failed':
                return MenuCode.TrailingStopLossRequestReturnToEditorMenu;
            
            case 'unconfirmed':
                return MenuCode.ListPositions;
            case 'tx-sim-failed-other':
                return MenuCode.TrailingStopLossRequestReturnToEditorMenu;

            case 'tx-sim-insufficient-sol':
            case 'insufficient-sol':
                return MenuCode.TrailingStopLossRequestReturnToEditorMenu;

            case 'frozen-token-account':
            case 'tx-sim-frozen-token-account':
                return MenuCode.TrailingStopLossRequestReturnToEditorMenu;

            case 'token-fee-account-not-initialized':
            case 'tx-sim-failed-token-account-fee-not-initialized':
                return MenuCode.Main;

            default:
                assertNever(status);
        }
    }    
}

function convertToConfirmedPosition(positionRequest: PositionRequest, 
    signature : string, 
    lastValidBH : number, 
    userAddress : UserAddress, 
    parsedSuccessfulSwap : ParsedSuccessfulSwapSummary) : Position & { buyConfirmed : true } {
    const position : Position & { buyConfirmed : true } = {
        userID: positionRequest.userID,
        chatID : positionRequest.chatID,
        messageID : positionRequest.messageID,
        positionID : positionRequest.positionID,
        userAddress: userAddress,
        type: positionRequest.positionType,
        status: PositionStatus.Open,

        buyConfirmed: true, // <-------------
        txBuyAttemptTimeMS: Date.now(), // TODO: This is wrong but will revisit.
        txBuySignature: signature,  
        buyLastValidBlockheight: lastValidBH,        

        sellConfirmed: false,
        txSellSignature: null,
        txSellAttemptTimeMS: null,
        sellLastValidBlockheight: null,

        token: positionRequest.token,
        vsToken: positionRequest.vsToken,
        sellSlippagePercent: positionRequest.slippagePercent,
        triggerPercent : positionRequest.triggerPercent,
        sellAutoDoubleSlippage : positionRequest.sellAutoDoubleSlippage,
    
        vsTokenAmt : fromNumber(positionRequest.vsTokenAmt),
        tokenAmt: parsedSuccessfulSwap.swapSummary.outTokenAmt,        
        fillPrice: parsedSuccessfulSwap.swapSummary.fillPrice,
        fillPriceMS : parsedSuccessfulSwap.swapSummary.swapTimeMS,
        netPNL: null // to be set when position is sold
    };
    return position;
}

