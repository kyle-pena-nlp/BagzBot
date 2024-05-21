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
    async listUniqueTokenPairs(telegramUserID : number, env : Env, walletPublicKey : string|undefined) : Promise<TokenPair[]> {
        const uniqueKeys : Set<string> = new Set<string>();
        if (this.tooLongSinceTokenPairListTrimmed(env) && walletPublicKey != null) {
            await this.tryTrimmingTokenPairList(telegramUserID, walletPublicKey, env);
        }
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

    private tooLongSinceTokenPairListTrimmed(env : Env) : boolean {
        if ((Date.now() - this.lastTimeWalletChecked.value) > strictParseInt(env.WALLET_BALANCE_REFRESH_INTERVAL_MS)) {
            return true;
        }
        else {
            return false;
        }
    }

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
        
        // Get the list of unique token pairs where the token is not in the wallet
        const keyFn = (x : TokenPairForAPosition) => `${x.token.address}:${x.vsToken.address}`;
        const tokenPairsToRemove = new SetWithKeyFn(Object.values(this.tokenPairsForPositionIDs).filter(tokenPair => !nonZeroWalletTokenAccounts.has(tokenPair.token.address)), keyFn);

        // For each one of those, double check that the token pair position tracker has no positions for this user 
        // (This would be the case if there is a buy which is still exectuing)
        for (const tokenPair of [...tokenPairsToRemove]) {
            const shouldRemove = (await listPositionsByUser(telegramUserID, tokenPair.token.address, tokenPair.vsToken.address, env)).length === 0;
            if (!shouldRemove) {
                tokenPairsToRemove.delete(tokenPair)
            }
        }

        // Finally, remove the pairs that we have confirmed can be removed
        for (const positionID of [...Object.keys(this.tokenPairsForPositionIDs)]) {
            const tokenPair = this.tokenPairsForPositionIDs[positionID];
            if (tokenPairsToRemove.has(tokenPair)) {
                delete this.tokenPairsForPositionIDs[positionID];
                this.markAsDeleted(new PositionIDKey(positionID));
            }
        }
    }

    private async getNonZeroWalletTokenAccounts(walletAddress : string, env : Env) : Promise<Set<string>> {
        return await findNonZeroBalanceTokenAccounts(walletAddress, env);
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