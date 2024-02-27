export interface TokenInfo {
    tokenAddress: string
    token : string /* Name */
    logoURI: string
}

export class TokenTracker {
    tokenInfos : Record<string,TokenInfo>
    dirtyTracking : Set<string> = new Set<string>();
    deletedKeys : Set<string> = new Set<string>();
    constructor() {
        this.tokenInfos = {};
    }
    initialize(entries : Map<string,any>) {
        for (const [key,value] of entries) {
            const tokenAddressKey = TokenAddressKey.parse(key);
            if (tokenAddressKey) {
                const tokenInfo = value as TokenInfo;
                this.tokenInfos[new TokenAddressKey(tokenInfo.tokenAddress).toString()] = tokenInfo;
            }
        }
    }
    get(tokenAddress : string) : TokenInfo|null {
        return this.tokenInfos[new TokenAddressKey(tokenAddress).toString()]||null;
    }
    addToken(tokenInfo : TokenInfo) {
        const tokenAddressKey = new TokenAddressKey(tokenInfo.tokenAddress);
        const existingTokenInfo = this.tokenInfos[tokenAddressKey.toString()];
        // only mark the key dirty if it doesn't already exist or if the token info changed.
        if (!existingTokenInfo || (existingTokenInfo && !this.tokenInfoEquals(existingTokenInfo, tokenInfo))) {
            this.tokenInfos[tokenAddressKey.toString()] = tokenInfo;
            this.markDirty(tokenAddressKey.toString()); 
        }
    }
    removeToken(tokenAddress : string) {
        delete this.tokenInfos[new TokenAddressKey(tokenAddress).toString()];
        this.markDeleted(new TokenAddressKey(tokenAddress).toString())
    }
    async flushToStorage(storage : DurableObjectStorage) {
        if (this.deletedKeys.size == 0 && this.dirtyTracking.size == 0) {
            return;
        }
        const putEntries : Record<string,TokenInfo> = {};
        for (const key of this.dirtyTracking) {
            putEntries[key] = this.tokenInfos[key];
        }
        const promise1 = storage.put(putEntries);
        const promise2 = storage.delete([...this.deletedKeys]);
        return await Promise.all([promise1,promise2]).then(() => {
            this.dirtyTracking.clear();
            this.deletedKeys.clear();
        });
    }
    markDirty(key : string) {
        this.deletedKeys.delete(key);
        this.dirtyTracking.add(key);
    }
    markDeleted(key : string) {
        this.dirtyTracking.delete(key);
        this.deletedKeys.add(key);
    }
    tokenInfoEquals(a : TokenInfo, b : TokenInfo) {
        return a.token === b.token && 
        a.tokenAddress === b.tokenAddress && 
        a.logoURI === b.logoURI;
    }
}

class TokenAddressKey {
    address : string
    constructor(address : string) {
        this.address = address;
    }
    toString() : string {
        return `tokenAddressKey:${this.address}`;
    }
    static parse(key : string) : TokenAddressKey|null {
        const tokens = key.split(":");
        const firstToken = tokens[0];
        if (firstToken === 'tokenAddressKey') {
            return new TokenAddressKey(tokens[1]);
        }
        return null;
    }
} 