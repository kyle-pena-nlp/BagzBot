
import { Connection, SimulateTransactionConfig, VersionedTransaction } from "@solana/web3.js";
import { Wallet, toUserAddress } from "../../crypto";
import { fromNumber } from "../../decimalized";
import { Env, getRPCUrl } from "../../env";
import { MenuCode } from "../../menus";
import { Position, PositionRequest, PositionStatus } from "../../positions";
import { getLatestValidBlockhash } from "../../rpc/rpc_blocks";
import { parseInstructionError } from "../../rpc/rpc_parse_instruction_error";
import { signatureOf } from "../../rpc/rpc_sign_tx";
import { ParsedSuccessfulSwapSummary, SwapExecutionError, isFrozenTokenAccountSwapExecutionErrorParseSummary, isInsufficientNativeTokensSwapExecutionErrorParseSummary, isInsufficientTokensBalanceErrorParseSummary, isOtherKindOfSwapExecutionError, isSlippageSwapExecutionErrorParseSummary, isSuccessfulSwapSummary, isTokenFeeAccountNotInitializedSwapExecutionErrorParseSummary, isUnknownTransactionParseSummary } from "../../rpc/rpc_swap_parse_result_types";
import { TGStatusMessage, UpdateableNotification } from "../../telegram";
import { assertNever, strictParseBoolean } from "../../util";
//import { insertPosition, positionExistsInTracker, removePosition, updatePosition } from "../token_pair_position_tracker/token_pair_position_tracker_DO_interop";
import { DecimalizedAmount, dZero } from "../../decimalized/decimalized_amount";
import { logError } from "../../logging";
import { SubsetOf } from "../../util/builder_types";
import { registerUser } from "../heartbeat/heartbeat_DO_interop";
import { getTokenPrice } from "../token_pair_position_tracker/token_pair_position_tracker_DO_interop";
import { SwapExecutor } from "./swap_executor";
import { SwapTransactionSigner } from "./swap_transaction_signer";
import { ClosedPositionsTracker } from "./trackers/closed_positions_tracker";
import { DeactivatedPositionsTracker } from "./trackers/deactivated_positions_tracker";
import { OpenPositionsTracker } from "./trackers/open_positions_tracker";

type ConfirmationData = SubsetOf<Position>;

type TxSimErrorCodes = 'tx-sim-failed-other'|
    'tx-sim-insufficient-sol'|
    'tx-sim-failed-slippage'|
    'tx-sim-frozen-token-account'|
    'tx-sim-failed-token-account-fee-not-initialized'|
    'tx-sim-insufficient-tokens-balance';

type PrepareTxErrorCodes = 'already-processed'|
    'could-not-create-tx'|
    TxSimErrorCodes;

type ExecuteTxErrorCodes = 'insufficient-sol'|
    'token-fee-account-not-initialized'|
    'frozen-token-account'|
    'slippage-failed'|
    'failed'|
    'unconfirmed'|
    'insufficient-tokens-balance';

type ExecuteTxResultCodes = ExecuteTxErrorCodes|'confirmed';

export interface PreparedBuyTx {
    signedTx: VersionedTransaction,
    lastValidBH: number,
    connection : Connection
}

export function isPreparedBuyTx(obj : PreparedBuyTx|string) : obj is PreparedBuyTx {
    return typeof obj !== 'string';
}

export class PositionBuyer {
    wallet : Wallet
    env : Env
    startTimeMS : number
    channel : UpdateableNotification
    openPositions : OpenPositionsTracker;
    closedPositions : ClosedPositionsTracker;
    deactivatedPositions : DeactivatedPositionsTracker;
    constructor(wallet : Wallet, 
        env : Env,  
        startTimeMS : number,
        channel : UpdateableNotification,
        openPositions : OpenPositionsTracker,
        closedPositions : ClosedPositionsTracker,
        deactivatedPositions : DeactivatedPositionsTracker) {
        this.wallet = wallet;
        this.env = env;
        this.startTimeMS = startTimeMS;
        this.channel = channel;
        this.openPositions = openPositions;
        this.closedPositions = closedPositions;
        this.deactivatedPositions = deactivatedPositions;
    }

    async prepareTx(positionRequest : PositionRequest) : Promise<
        PreparedBuyTx|PrepareTxErrorCodes> {
        // RPC connection
        const connection = new Connection(getRPCUrl(this.env));

        // idempotency (NOTE: should we also check deactivated / closed?)
        if (this.positionExistsInTracker(positionRequest.positionID, positionRequest.token.address, positionRequest.vsToken.address, this.env)) {
            return 'already-processed';
        }

        // get signed tx (signed does not mean executed, per se)
        const signedTx = await this.createSignedTx(positionRequest, this.channel);

        // if failed to get signedTx, early out.
        if (signedTx == null) {
            TGStatusMessage.queue(this.channel, `Unable to sign transaction.`, true);
            return 'could-not-create-tx';
        }

        // if we sim the tx before buy, run the sim of the tx
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

        const tokenPriceResult = await getTokenPrice(unconfirmedPosition.token.address, unconfirmedPosition.vsToken.address, this.env);
        if (tokenPriceResult.price == null) {
            return 'could-not-create-tx'; // TODO: more appropriate return code.
        }

        const insertPositionResponse = this.insertPosition(unconfirmedPosition, tokenPriceResult.price, tokenPriceResult.currentPriceMS);
        if(!insertPositionResponse.success) {
            return 'could-not-create-tx'; // TODO: more appropriate return code.
        }

        return {
            signedTx, lastValidBH, connection
        }
    }

    async executeTxAndFinalizeChannel(positionRequest : PositionRequest, preparedTx : PreparedBuyTx) : Promise<void> {
        try {
            const finalStatus = await this.executeTx(positionRequest, preparedTx);
            const finalMessage = this.getFinalStatusMessage(finalStatus);
            const finalMenuCode = this.getFinalMenuCode(finalStatus);
            TGStatusMessage.queue(this.channel, 
                finalMessage, 
                finalMenuCode, 
                positionRequest.positionID);
        }
        catch (e : any) {
            logError(positionRequest.positionID, e.toString());
            TGStatusMessage.queue(this.channel, 'There was an unexpected error with this purchase', MenuCode.Main); // should not return.  that would keep the same positionID, and submitting would just attempt to buy again.
        }
        finally {
            await TGStatusMessage.finalize(this.channel);
        }
    }

    async finalizeChannel(positionID : string, finalStatus : PrepareTxErrorCodes|ExecuteTxResultCodes) : Promise<void> {
        const finalMessage = this.getFinalStatusMessage(finalStatus);
        const finalMenuCode = this.getFinalMenuCode(finalStatus);
        TGStatusMessage.queue(this.channel, 
            finalMessage, 
            finalMenuCode, 
            positionID);
        TGStatusMessage.finalize(this.channel);
    }

    // Lots of different kinds of things can go wrong. Hence the nasty return type.
    async executeTx(positionRequest : PositionRequest, preparedTx : PreparedBuyTx) : Promise<ExecuteTxResultCodes> {

        // try to do the swap.
        const result = await this.executeAndParseSwap(positionRequest, preparedTx.signedTx, preparedTx.lastValidBH, preparedTx.connection);

        // no guarantees that anything after this point executes... CF may drop it.

        // if the tx definetely failed, remove the position from tracking.
        if (result === 'failed' || result === 'slippage-failed' || result === 'insufficient-sol' || result === 'frozen-token-account' || result === 'token-fee-account-not-initialized' || result === 'insufficient-tokens-balance') {
            this.removePosition(positionRequest.positionID, positionRequest.token.address, positionRequest.vsToken.address, this.env);
            return result;
        }
        // but if we can't determine what happened, we say so to the caller
        else if (result === 'unconfirmed') {
            return result;
        }
        // but if it really is confirmed, we update the position in the tracker.
        else if ('confirmationData' in result) {
            const { confirmationData } = result;
            this.updatePosition(positionRequest.positionID, confirmationData);
            return 'confirmed';
        }
        else {
            assertNever(result);
        }
    }
    updatePosition(positionID : string, confirmationData: ConfirmationData) {
        this.openPositions.mutatePosition(positionID, p => {
            Object.assign(p, confirmationData);
        });
    }
    removePosition(positionID: string, address: string, address1: string, env: Env) {
        this.openPositions.deletePosition(positionID);
    }
    insertPosition(unconfirmedPosition: Position & { buyConfirmed: false; }, price : DecimalizedAmount, currentPriceMS : number) : { success : boolean } {
        const success = this.openPositions.insertPosition(unconfirmedPosition, price, currentPriceMS);
        registerUser(unconfirmedPosition.userID, unconfirmedPosition.chatID, this.env);
        return { success }; // cruft
    }
    positionExistsInTracker(positionID: string, address: string, address1: string, env: Env) : boolean {
        return this.openPositions.has(positionID) || this.closedPositions.has(positionID) || this.deactivatedPositions.has(positionID);
    }

    private async simulateTx(signedTx : VersionedTransaction, connection : Connection) : Promise<'success'|TxSimErrorCodes> {
        const config: SimulateTransactionConfig = {
            sigVerify: true, // use the signature of the signedTx to verify validity of tx, rather than fetching a new blockhash
            commitment: 'confirmed' // omitting this seems to cause simulation to fail.
        };
        const response = await connection.simulateTransaction(signedTx, config);
        // TODO: we can use response + config to get detailed tx info, better than quote.

        if (!response.value.err) {
            return 'success';
        }

        const swapExecutionError =  parseInstructionError(response.value.logs||[], response.value.err, this.env);

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
        else if (swapExecutionError === SwapExecutionError.InsufficientTokensBalance) {
            return 'tx-sim-insufficient-tokens-balance';
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
            buyConfirming: false,
            txBuyAttemptTimeMS: Date.now(),
            txBuySignature: signature,
            buyLastValidBlockheight: lastValidBH,
            
            sellConfirmed: false,
            sellConfirming: false,
            txSellSignature: null,
            txSellAttemptTimeMS: null,
            sellLastValidBlockheight: null,
    
            token: positionRequest.token,
            vsToken: positionRequest.vsToken,
            vsTokenAmt : fromNumber(positionRequest.vsTokenAmt), // don't use the quote, it includes fees.
            tokenAmt: positionRequest.quote.outTokenAmt,

            // TODO: think about this. A better way that is not a big refactor?
            currentPrice: dZero(),
            currentPriceMS: 0,
            peakPrice: dZero(),
    
            sellSlippagePercent: positionRequest.slippagePercent,
            triggerPercent : positionRequest.triggerPercent,
            sellAutoDoubleSlippage : autoDouble,
            fillPrice: positionRequest.quote.fillPrice,
            fillPriceMS : positionRequest.quote.quoteTimeMS,
            netPNL: null, // to be set when position is closed
            otherSellFailureCount: 0,
            buyPriorityFeeAutoMultiplier: positionRequest.priorityFeeAutoMultiplier,
            sellPriorityFeeAutoMultiplier: positionRequest.priorityFeeAutoMultiplier
        };
        return position;
    }

    private async createSignedTx(positionRequest : PositionRequest, notificationChannel : UpdateableNotification) {
        const swapTxSigner = new SwapTransactionSigner(this.wallet, this.env, notificationChannel);
        const signedTx = await swapTxSigner.createAndSign(positionRequest);
        return signedTx;
    }

    private async executeAndParseSwap(positionRequest: PositionRequest, signedTx : VersionedTransaction, lastValidBH : number, connection : Connection) : Promise<ExecuteTxErrorCodes|{ confirmationData : ConfirmationData }> {
        
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
        else if (isInsufficientTokensBalanceErrorParseSummary(parsedSwapSummary)) {
            return 'insufficient-tokens-balance';
        }
        else if (isSuccessfulSwapSummary(parsedSwapSummary)) {
            const confirmationData = this.makeConfirmationDataFromSwapResult(signatureOf(signedTx), lastValidBH, parsedSwapSummary);
            return { confirmationData };
        }
        else {
            assertNever(parsedSwapSummary);
        }
    }

    private  makeConfirmationDataFromSwapResult(
        signature : string,
        lastValidBH: number,
        parsedSuccessfulSwap : ParsedSuccessfulSwapSummary) : ConfirmationData {
        return {
                buyConfirmed: true, // <-------------
                txBuyAttemptTimeMS: Date.now(), // TODO: This is wrong but will revisit.
                txBuySignature: signature,  
                buyLastValidBlockheight: lastValidBH,        
                sellConfirmed: false,
                txSellSignature: null,
                txSellAttemptTimeMS: null,
                sellLastValidBlockheight: null,
                tokenAmt: parsedSuccessfulSwap.swapSummary.outTokenAmt,        
                fillPrice: parsedSuccessfulSwap.swapSummary.fillPrice,
                fillPriceMS : parsedSuccessfulSwap.swapSummary.swapTimeMS,
                netPNL: null, // to be set when position is sold
                otherSellFailureCount: 0,
                currentPrice: parsedSuccessfulSwap.swapSummary.fillPrice,
                currentPriceMS: parsedSuccessfulSwap.swapSummary.swapTimeMS,
                peakPrice: parsedSuccessfulSwap.swapSummary.fillPrice, // TODO: think about this
        };
    }
    
    private getFinalStatusMessage(status: PrepareTxErrorCodes|ExecuteTxResultCodes) : string {
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
                return 'This token has been frozen due to suspicious activity or low liquidity / volume!';

            case 'tx-sim-failed-slippage': 
            case 'slippage-failed':
                return 'Purchase failed due to slippage tolerance exceeded.';

            case 'insufficient-tokens-balance':
            case 'tx-sim-insufficient-tokens-balance':
                // it doesn't make any sense for this to happen but it's here to make TS happy
                return 'Purchase failed due to insufficient token balance.';
            
            case 'unconfirmed':
                return 'Purchase could not be confirmed due to network congestion.  We will reattempt to confirm the purchase in a bit.';
            default:
                assertNever(status);
        }
    }

    private getFinalMenuCode(status: PrepareTxErrorCodes|ExecuteTxResultCodes) : MenuCode {
        switch(status) {
            case 'already-processed':
                return MenuCode.Main;
            
            case 'could-not-create-tx':
                return MenuCode.ReturnToPositionRequestEditor;
            
            case 'confirmed':
                return MenuCode.ViewOpenPosition;
            
            // what if it's an unexpected exception? the position might still be inserted. hmmm.
            case 'failed':
                return MenuCode.ReturnToPositionRequestEditor;
            
            case 'tx-sim-failed-slippage':
            case 'slippage-failed':
                return MenuCode.ReturnToPositionRequestEditor;
            
            case 'unconfirmed':
                return MenuCode.ListPositions;
            case 'tx-sim-failed-other':
                return MenuCode.ReturnToPositionRequestEditor;

            case 'tx-sim-insufficient-sol':
            case 'insufficient-sol':
                return MenuCode.ReturnToPositionRequestEditor;

            case 'frozen-token-account':
            case 'tx-sim-frozen-token-account':
                return MenuCode.ReturnToPositionRequestEditor;

            case 'token-fee-account-not-initialized':
            case 'tx-sim-failed-token-account-fee-not-initialized':
                return MenuCode.Main;

            case 'tx-sim-insufficient-tokens-balance':
            case 'insufficient-tokens-balance':
                // this case should never happen but is here to make TS happy
                return MenuCode.Main;

            default:
                assertNever(status);
        }
    }    
}