export interface PolledTokenPairInfo {
    tokenAddress : string
    vsTokenAddress : string
    // TODO: other properties.  also add these in this.tokenPairInfosEqual
}

export class PolledTokenPairTracker {
    polledTokenPairs : Record<string,PolledTokenPairInfo>
    dirtyTracking : Set<string>
    deletedKeys : Set<string>
    constructor() {
        this.polledTokenPairs = {};
        this.dirtyTracking = new Set<string>();
        this.deletedKeys = new Set<string>();
    }
    upsertPolledTokenPair(tokenAddress : string, vsTokenAddress : string) {
        const polledTokenKeyPair = new PolledTokenPairKey(tokenAddress, vsTokenAddress);
        const tokenPairInfo = {
            tokenAddress : tokenAddress,
            vsTokenAddress : vsTokenAddress
        };
        const existingTokenPairInfo = this.polledTokenPairs[polledTokenKeyPair.toString()];
        // If it's a new token pair, or its info changed, mark dirty.
        if (!existingTokenPairInfo || (existingTokenPairInfo && !this.tokenPairInfosEqual(existingTokenPairInfo, tokenPairInfo))) {
            this.polledTokenPairs[polledTokenKeyPair.toString()] = tokenPairInfo;
            this.markDirty(polledTokenKeyPair.toString());
        }
    }
    deleteTokenPair(tokenAddress : string, vsTokenAddress : string) {
        const polledTokenPairKey = new PolledTokenPairKey(tokenAddress, vsTokenAddress);
        delete this.polledTokenPairs[polledTokenPairKey.toString()]
        this.markForDeletion(polledTokenPairKey.toString())
    }
    *list() {
        for (const key in Object.keys(this.polledTokenPairs)) {
            const tokenPairInfo = this.polledTokenPairs[key];
            yield [tokenPairInfo.tokenAddress, tokenPairInfo.vsTokenAddress];
        }
    }
    initialize(entries : Map<string,any>) {
        for (const [key,value] of entries) {
            const polledTokenPairKey = PolledTokenPairKey.parse(key);
            if (polledTokenPairKey != null) {
                this.polledTokenPairs[key] = value as PolledTokenPairInfo;
            }
        }
    }
    markDirty(key : string) {
        this.deletedKeys.delete(key);
        this.dirtyTracking.add(key);
    }
    markForDeletion(key : string) {
        this.dirtyTracking.delete(key);
        this.deletedKeys.add(key);
    }
    tokenPairInfosEqual(a : PolledTokenPairInfo, b : PolledTokenPairInfo) : boolean {
        return a.tokenAddress === b.tokenAddress &&
            a.vsTokenAddress === b.vsTokenAddress;
    }
    async flushToStorage(storage : DurableObjectStorage) {
        if (this.deletedKeys.size == 0 && this.dirtyTracking.size == 0) {
            return;
        }
        const putEntries : Record<string,PolledTokenPairInfo> = {};
        for (const key of this.dirtyTracking) {
            putEntries[key] = this.polledTokenPairs[key];
        }
        const promise1 = storage.put(putEntries);
        const promise2 = storage.delete([...this.deletedKeys]);
        return await Promise.all([promise1, promise2]).then(() => {
            this.dirtyTracking.clear();
            this.deletedKeys.clear();
        });
    }
}

export class PolledTokenPairKey {
    tokenAddress : string
    vsTokenAddress : string
    constructor(tokenAddress : string, vsTokenAddress : string) {
        this.tokenAddress = tokenAddress;
        this.vsTokenAddress = vsTokenAddress;
    }
    toString() : string {
        return `tokenPairKey:${this.tokenAddress}:${this.vsTokenAddress}`;
    }
    static parse(key : string) : PolledTokenPairKey|null {
        const tokens = key.split(":");
        if (tokens[0] === 'tokenPairKey') {
            return new PolledTokenPairKey(tokens[1], tokens[2])
        }
        else {
            return null;
        }
    }
}