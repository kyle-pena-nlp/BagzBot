import { TokenPair } from "../model/token_pair";

export interface TokenPairForAPosition {
    positionID : string,
    // this is a bit awkward, but necessary for backwards compat with existing values from testing
    token : { address : string },
    vsToken : { address : string }
}

export class TokenPairTracker {
    keyPrefix : string
    tokenPairsForPositionIDs : Record<string,TokenPairForAPosition> = {};
    dirtyTracking : Set<string> = new Set<string>();
    deletedKeys : Set<string> = new Set<string>();
    constructor(keyPrefix : string) {
        this.keyPrefix = keyPrefix;
    }
    any() : boolean {
        return Object.keys(this.tokenPairsForPositionIDs).length > 0;
    }
    initialize(entries : Map<string,any>) {
        const entryKeys = [...entries.keys()];
        for (const entryKey of (entryKeys)) {
            const parsedKey = TokenPairTrackerKey.parse(this.keyPrefix, entryKey);
            if (parsedKey != null) {
                const tokenPairForPosition = entries.get(parsedKey.toString());
                this.tokenPairsForPositionIDs[parsedKey.toString()] = tokenPairForPosition;
            }
        }
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

    async flushToStorage(storage : DurableObjectStorage) {
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
        await Promise.allSettled([putPromise, deletePromise]);
    }
    registerPosition(position: TokenPairForAPosition) {
        const positionIDKey = new TokenPairTrackerKey(this.keyPrefix, position.positionID);
        this.tokenPairsForPositionIDs[positionIDKey.toString()] = position;
        this.markAsDirty(positionIDKey);  
    }
    removePositions(positionIDs : string[]) {
        for (const positionID of positionIDs) {
            const positionIDKey = new TokenPairTrackerKey(this.keyPrefix, positionID);
            delete this.tokenPairsForPositionIDs[positionIDKey.toString()];
            this.markAsDeleted(positionIDKey);
        }
    }
    listPositionIDs() : string[] {
        const results : string[] = [];
        for (const key of Object.keys(this.tokenPairsForPositionIDs)) {
            const positionIDKey = TokenPairTrackerKey.parse(this.keyPrefix, key);
            if (positionIDKey == null) {
                continue;
            }
            results.push(positionIDKey.positionID)
        }
        return results;
    }
    getPositionPair(positionID : string) : TokenPairForAPosition|null {
        const positionIDKey = new TokenPairTrackerKey(this.keyPrefix, positionID);
        return this.tokenPairsForPositionIDs[positionIDKey.toString()]||null;
    }
    private markAsDirty(key : TokenPairTrackerKey) {
        this.deletedKeys.delete(key.toString());
        this.dirtyTracking.add(key.toString());
    }
    private markAsDeleted(key : TokenPairTrackerKey) {
        this.dirtyTracking.delete(key.toString());
        this.deletedKeys.add(key.toString());
    }
}

class TokenPairTrackerKey {
    prefixKey : string
    positionID : string;
    constructor(prefixKey : string, positionID : string) {
        this.prefixKey = prefixKey;
        this.positionID = positionID;
    }
    toString() : string {
        return `${this.prefixKey}:${this.positionID}`;
    }
    static parse(prefixKey : string, key : string) {
        const tokens = key.split(":");
        const firstToken = tokens[0];
        if (firstToken === prefixKey) {
            return new TokenPairTrackerKey(prefixKey, tokens[1]);
        }
        return null;
    }
}