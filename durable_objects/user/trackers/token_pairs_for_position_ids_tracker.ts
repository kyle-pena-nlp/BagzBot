
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
    constructor() {
    }
    initialize(entries : Map<string,any>) {
        const entryKeys = [...entries.keys()];
        for (const entryKey of (entryKeys)) {
            const positionIDKey = PositionIDKey.parse(entryKey);
            if (positionIDKey != null) {
                const position = entries.get(positionIDKey.toString());
                this.tokenPairsForPositionIDs[positionIDKey.toString()] = position;
            }
        }
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
    storePosition(position: TokenPairForAPosition) {
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
    getPosition(positionID : string) : TokenPairForAPosition|null {
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