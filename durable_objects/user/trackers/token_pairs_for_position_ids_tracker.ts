import { Env } from "../../../env";
import { logError } from "../../../logging";
import { findNonZeroBalanceTokenAccounts } from "../../../rpc/rpc_wallet";
import { ChangeTrackedValue, SetWithKeyFn, strictParseInt } from "../../../util";
import { listPositionsByUser } from "../../token_pair_position_tracker/token_pair_position_tracker_DO_interop";
import { TokenPair } from "../model/token_pair";

export interface TokenPairForAPosition {
    positionID : string,
    // this is a bit awkward, but necessary for backwards compat with existing values from testing
    token : { address : string },
    vsToken : { address : string }
}

export class TokenPairsForPositionIDsTracker {
    tokenPairsForPositionIDs : Record<string,TokenPairForAPosition> = {};
    dirtyTracking : Set<string> = new Set<string>();
    deletedKeys : Set<string> = new Set<string>();
    lastTimeWalletChecked : ChangeTrackedValue<number> = new ChangeTrackedValue<number>("tokenPairsLastTimeWalletChecked", 0);
    
    constructor() {
    }

    any() : boolean {
        return Object.keys(this.tokenPairsForPositionIDs).length > 0;
    }

    initialize(entries : Map<string,any>) {
        this.lastTimeWalletChecked.initialize(entries);
        const entryKeys = [...entries.keys()];
        for (const entryKey of (entryKeys)) {
            const positionIDKey = PositionIDKey.parse(entryKey);
            if (positionIDKey != null) {
                const tokenPairForPosition = entries.get(positionIDKey.toString());
                this.tokenPairsForPositionIDs[positionIDKey.toString()] = tokenPairForPosition;
            }
        }
    }

    async flushToStorage(storage : DurableObjectStorage) {
        const lastTimeWalletCheckedPromise = this.lastTimeWalletChecked.flushToStorage(storage);
        if (this.dirtyTracking.size == 0 && this.deletedKeys.size == 0) {
            return;
        }
        const putEntries : Record<string,TokenPairForAPosition> = {};
        for (const key of this.dirtyTracking) {
            const value = this.tokenPairsForPositionIDs[key];
            putEntries[key] = value;
        }
        const putPromise = storage.put(putEntries).then(() => {
            this.dirtyTracking.clear();
        });
        const deletePromise = storage.delete([...this.deletedKeys]).then(() => {
            this.deletedKeys.clear();
        });
        await Promise.allSettled([lastTimeWalletCheckedPromise, putPromise, deletePromise]);
    }

    async listUniqueTokenPairs() : Promise<TokenPair[]> {
        const uniqueKeys : Set<string> = new Set<string>();
        const tokenPairs : TokenPair[] = [];
        for (const positionID of Object.keys(this.tokenPairsForPositionIDs)) {
            const tokenPairForPosition = this.tokenPairsForPositionIDs[positionID];
            const key = `${tokenPairForPosition.token.address}:${tokenPairForPosition.vsToken.address}`;
            if (!uniqueKeys.has(key)) {
                uniqueKeys.add(key);
                tokenPairs.push({
                    tokenAddress : tokenPairForPosition.token.address,
                    vsTokenAddress: tokenPairForPosition.vsToken.address
                });
            }
        }
        return tokenPairs;
    }

    async maybeTrimTokenPairList(telegramUserID : number, walletPublicKey : string, env : Env) {
        if (this.tooLongSinceTokenPairListTrimmed(env)) {
            await this.tryTrimmingTokenPairList(telegramUserID, walletPublicKey, env);
        }
    }

    private tooLongSinceTokenPairListTrimmed(env : Env) : boolean {
        if ((Date.now() - this.lastTimeWalletChecked.value) > strictParseInt(env.WALLET_BALANCE_REFRESH_INTERVAL_MS)) {
            return true;
        }
        else {
            return false;
        }
    }

    // Expensive operation: Thoroughly check to see if certain token pair trackers still need to be queried for this user.
    private async tryTrimmingTokenPairList(telegramUserID : number, walletPublicKey : string, env: Env) {
        
        // Query the wallet for a list of non-zero balance tokens
        const nonZeroWalletTokenAccounts : Set<string>|null = await this.getNonZeroWalletTokenAccounts(walletPublicKey, env).catch(r => {
            logError(`Could not fetch list of non-zero balance tokens from ${walletPublicKey}`);
            return null;
        });
        
        // If the query failed, early-out
        if (nonZeroWalletTokenAccounts == null) {
            return;
        }
        
        // Get the list of unique token pairs where there's none of this token in the wallet - these are candidates for removal
        const keyFn = (x : TokenPair) => `${x.tokenAddress}:${x.vsTokenAddress}`;
        const tokenPairRemovalCandidates = new SetWithKeyFn(Object.values(this.tokenPairsForPositionIDs)
            .map(tokenPairForPosition => { return { tokenAddress : tokenPairForPosition.token.address, vsTokenAddress : tokenPairForPosition.vsToken.address } })
            .filter(tokenPair => !nonZeroWalletTokenAccounts.has(tokenPair.tokenAddress)), keyFn);

        // For each, double check that there aren't any positions in the tracker for this user (can happen if the position is in a weird state like an unconfirmed buy)
        for (const tokenPairRemovalCandidate of [...tokenPairRemovalCandidates]) {
            const positionsForTokenPair = (await listPositionsByUser(telegramUserID, tokenPairRemovalCandidate.tokenAddress, tokenPairRemovalCandidate.vsTokenAddress, env));
            if (positionsForTokenPair.length == 0) {
                // If we are in the clear (no positions for this user in the tracker), remove any that are for this token pair
                for (const positionID of [...Object.keys(this.tokenPairsForPositionIDs)]) {
                    const tokenPairForPosition = this.tokenPairsForPositionIDs[positionID];
                    const tokenPair = { tokenAddress : tokenPairForPosition.token.address, vsTokenAddress: tokenPairForPosition.vsToken.address };
                    if (keyFn(tokenPair) == keyFn(tokenPairRemovalCandidate)) {
                        delete this.tokenPairsForPositionIDs[positionID];
                        this.markAsDeleted(new PositionIDKey(positionID));
                    }
                } 
            }
        }
    }

    private async getNonZeroWalletTokenAccounts(walletAddress : string, env : Env) : Promise<Set<string>> {
        return await findNonZeroBalanceTokenAccounts(walletAddress, env);
    }

    registerPosition(position: TokenPairForAPosition) {
        const positionIDKey = new PositionIDKey(position.positionID);
        this.tokenPairsForPositionIDs[positionIDKey.toString()] = position;
        this.markAsDirty(positionIDKey);  
    }
    removePositions(positionIDs : string[]) {
        for (const positionID of positionIDs) {
            const positionIDKey = new PositionIDKey(positionID);
            delete this.tokenPairsForPositionIDs[positionIDKey.toString()];
            this.markAsDeleted(positionIDKey);
        }
    }
    listPositionIDs() : string[] {
        const results : string[] = [];
        for (const key of Object.keys(this.tokenPairsForPositionIDs)) {
            const positionIDKey = PositionIDKey.parse(key);
            if (positionIDKey == null) {
                continue;
            }
            results.push(positionIDKey.positionID)
        }
        return results;
    }
    getPositionPair(positionID : string) : TokenPairForAPosition|null {
        const positionIDKey = new PositionIDKey(positionID);
        return this.tokenPairsForPositionIDs[positionIDKey.toString()]||null;
    }
    private markAsDirty(key : PositionIDKey) {
        this.deletedKeys.delete(key.toString());
        this.dirtyTracking.add(key.toString());
    }
    private markAsDeleted(key : PositionIDKey) {
        this.dirtyTracking.delete(key.toString());
        this.deletedKeys.add(key.toString());
    }
}

class PositionIDKey {
    positionID : string;
    constructor(positionID : string) {
        this.positionID = positionID;
    }
    toString() : string {
        return `positionID:${this.positionID}`;
    }
    static parse(key : string) {
        const tokens = key.split(":");
        const firstToken = tokens[0];
        if (firstToken === 'positionID') {
            return new PositionIDKey(tokens[1]);
        }
        return null;
    }
}