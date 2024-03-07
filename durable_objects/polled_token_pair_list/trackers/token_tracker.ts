import { TokenInfo } from "../../../tokens/token_info";


export class TokenTracker {
    tokenInfos : Record<string,TokenInfo> = {};
    nonExistentTokenAddresses : Record<string,Date> = {};
    dirtyTracking : Set<string> = new Set<string>();
    deletedKeys : Set<string> = new Set<string>();
    constructor() {
    }
    initialize(entries : Map<string,any>) {
        for (const [key,value] of entries) {
            const tokenAddressKey = TokenAddressKey.parse(key);
            if (tokenAddressKey) {
                const tokenInfo = value as TokenInfo;
                this.tokenInfos[new TokenAddressKey(tokenInfo.address).toString()] = tokenInfo;
            }
        }
    }
    get(tokenAddress : string) : TokenInfo|null {
        const tokenAddressKey = new TokenAddressKey(tokenAddress);
        const maybeTokenInfo = this.tokenInfos[tokenAddressKey.toString()];
        return maybeTokenInfo;
    }
    addToken(tokenInfo : TokenInfo) {
        const tokenAddressKey = new TokenAddressKey(tokenInfo.address);
        const existingTokenInfo = this.tokenInfos[tokenAddressKey.toString()];
        // only mark the key dirty if it doesn't already exist or if the token info changed.
        if (!existingTokenInfo || (existingTokenInfo && !this.tokenInfoEquals(existingTokenInfo, tokenInfo))) {
            this.tokenInfos[tokenAddressKey.toString()] = tokenInfo;
            this.markDirty(tokenAddressKey.toString()); 
        }
        this.markAsExistent(tokenInfo.address);
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
        const putPromise = storage.put(putEntries).then(() => {
            this.dirtyTracking.clear();
        })
        const deletePromise = storage.delete([...this.deletedKeys]).then(() => {
            this.deletedKeys.clear();
        })
        await Promise.all([putPromise, deletePromise]);
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
        return a.address === b.address && 
        a.decimals === b.decimals && 
        a.logoURI === b.logoURI &&
        a.name === b.name &&
        a.symbol === b.symbol;
    }
    markAsExistent(tokenAddress : string) {
        const tokenAddressKey = new TokenAddressKey(tokenAddress);
        delete this.nonExistentTokenAddresses[tokenAddressKey.toString()];
    }
    markAsNonExistent(tokenAddress : string) {
        const tokenAddressKey = new TokenAddressKey(tokenAddress);
        this.nonExistentTokenAddresses[tokenAddressKey.toString()] = new Date();
    }
    isNonExistent(tokenAddress : string) : Date|null {
        const tokenAddressKey = new TokenAddressKey(tokenAddress);
        return this.nonExistentTokenAddresses[tokenAddressKey.toString()]||null;
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