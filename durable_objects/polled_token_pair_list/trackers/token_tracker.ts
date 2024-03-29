import { Env } from "../../../env";
import { logError } from "../../../logging";
import { TokenInfo } from "../../../tokens";
import { strictParseInt } from "../../../util";

export class TokenTracker {
    tokenInfos : Record<string,TokenInfo> = {};
    dirtyTracking : Set<string> = new Set<string>();
    deletedKeys : Set<string> = new Set<string>();
    lastRefreshedMS : number = 0;
    isRebuilding : boolean = false;
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
    async getTokenInfo(tokenAddress : string, env : Env, storage : DurableObjectStorage) : Promise<TokenInfo|undefined> {
        const tokenAddressKey = new TokenAddressKey(tokenAddress);
        let maybeTokenInfo = this.tokenInfos[tokenAddressKey.toString()];
        if (maybeTokenInfo == null && (this.isTimeoutExpired(env))) {
            // deliberate fire and forget - next person will have accurate list.
            this.rebuildTokenList(storage);
            maybeTokenInfo = this.tokenInfos[tokenAddressKey.toString()];
        }        
        return maybeTokenInfo;
    }
    upsertToken(tokenInfo : TokenInfo) {
        const tokenAddressKey = new TokenAddressKey(tokenInfo.address);
        const existingTokenInfo = this.tokenInfos[tokenAddressKey.toString()];
        // only mark the key dirty if it doesn't already exist or if the token info changed.
        if (existingTokenInfo == null || (existingTokenInfo && !this.tokenInfoEquals(existingTokenInfo, tokenInfo))) {
            this.tokenInfos[tokenAddressKey.toString()] = tokenInfo;
            this.markDirty(tokenAddressKey.toString()); 
        }
    }
    deleteToken(address : string) {
        const tokenAddressKey = new TokenAddressKey(address);
        if (tokenAddressKey.toString() in this.tokenInfos) {
            delete this.tokenInfos[tokenAddressKey.toString()];
            this.markDeleted(tokenAddressKey.toString());
        }
    }
    isTimeoutExpired(env : Env) {
        if ((Date.now() - this.lastRefreshedMS) > strictParseInt(env.TOKEN_LIST_REFRESH_TIMEOUT)) {
            return true;
        }
        else {
            return false;
        }
    }
    private async rebuildTokenList(storage : DurableObjectStorage) : Promise<void> {
        if (this.isRebuilding) {
            return;
        }
        else {
            this.isRebuilding = true;
            try {
                const jupTokens = await this.getAllTokensFromJupiter();
                if (jupTokens != null) {
                    // originally: drop tokens that drop off the list.
                    // but I changed my mind: will keep them so that people can still execute their trades
                    /*
                    const oldTokenAddressSet = new Set<string>(Object.values(this.tokenInfos).map(t => t.address));
                    const newTokenAddressSet = new Set<string>(Object.values(jupTokens).map(t => t.address));
                    const deadTokens = setDifference(oldTokenAddressSet, newTokenAddressSet, Set<string>);
                    for (const deadToken of deadTokens) {
                        this.deleteToken(deadToken);
                    }*/
                    for (const tokenInfo of Object.values(jupTokens)) {
                        this.upsertToken(tokenInfo);
                    }
                    this.lastRefreshedMS = Date.now(); 
                    await this.flushToStorage(storage);
                }
            }
            catch(e) {
                logError("Unable to rebuild token list");
            }
            finally {
                this.isRebuilding = false;
            }
        }
    }
    private async getAllTokensFromJupiter() : Promise<Record<string,TokenInfo>|undefined> {
        const url = "https://token.jup.ag/all";
        const response = await fetch(url);
        if (!response.ok) {
            return;
        }
        const allTokensJSON = await response.json() as any[];
        const tokenInfos : Record<string,TokenInfo> = {};
        for (const tokenJSON of allTokensJSON) {
            const tokenInfo : TokenInfo = { 
                address: tokenJSON.address as string,
                name: tokenJSON.name as string,
                symbol: tokenJSON.symbol as string,
                logoURI: tokenJSON.logoURI as string,
                decimals: tokenJSON.decimals as number
            };
            tokenInfos[tokenInfo.address] = tokenInfo;
        }
        return tokenInfos;   
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
        });
        const deletePromise = storage.delete([...this.deletedKeys]).then(() => {
            this.deletedKeys.clear();
        });
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
}

class TokenAddressKey {
    address : string;
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