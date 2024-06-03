import { Env } from "../../../env";
import { logDebug, logError } from "../../../logging";
import { TokenInfo } from "../../../tokens";
import { ChangeTrackedValue, strictParseInt } from "../../../util";

type MIGRATION_FLAG = 'no-token-type'|'has-token-type';

export class TokenTracker {
    tokenInfos : Record<string,TokenInfo> = {};
    dirtyTracking : Set<string> = new Set<string>();
    deletedKeys : Set<string> = new Set<string>();
    lastRefreshedMS : number = 0;
    isRebuilding : boolean = false;
    migrationFlag : ChangeTrackedValue<MIGRATION_FLAG> = new ChangeTrackedValue<MIGRATION_FLAG>("tokenTrackerMigrationFlagStatus",'no-token-type');
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
        this.migrationFlag.initialize(entries);
    }
    async getTokenInfo(tokenAddress : string, env : Env, storage : DurableObjectStorage) : Promise<TokenInfo|undefined> {

        const migrationResult = await this.maybePerformMigration(storage);
        if (migrationResult === 'early-out') {
            logDebug("Early out - migration hasn't happened yet.")
            return undefined;
        }
        
        const tokenAddressKey = new TokenAddressKey(tokenAddress);
        let maybeTokenInfo = this.tokenInfos[tokenAddressKey.toString()];
        if (maybeTokenInfo == null && (this.isTimeoutExpired(env))) {
            // deliberate fire and forget - next person will have accurate list.
            this.rebuildTokenList(storage);
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
    async rebuildTokenList(storage : DurableObjectStorage) : Promise<boolean> {

        // bounce requests to rebuild if already rebuilding
        if (this.isRebuilding) {
            return false;
        }

        this.isRebuilding = true;
        try {

            const jupTokens = await this.getAllTokensFromJupiter();
            if (jupTokens == null) {
                return false;
            }

            // originally: drop tokens that drop off the list.
            // but I changed my mind: will keep them so that people can still execute their trades
            const tokenCount = Object.keys(jupTokens).length;
            logDebug(`Beginning upsert of tokens.  Total tokens: ${tokenCount}`);
            const startMS = Date.now();
            for (const tokenInfo of Object.values(jupTokens)) {
                this.upsertToken(tokenInfo);
            }
            this.lastRefreshedMS = Date.now(); 
            logDebug("Writing to storage.");
            await this.flushToStorage(storage);
            logDebug(`Done upsert tokens list.  Total tokens: ${tokenCount}, Elapsed Time; ${Date.now() - startMS}`);
            return true;
        }
        catch(e) {
            logError("Unable to rebuild token list");
            return false;
        }
        finally {
            this.isRebuilding = false;
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
                decimals: tokenJSON.decimals as number,
                tokenType: ((tokenJSON.tags||[]) as string[]).includes('token-2022') ? 'token-2022' : 'token'
            };
            tokenInfos[tokenInfo.address] = tokenInfo;
        }
        return tokenInfos;   
    }
    async flushToStorage(storage : DurableObjectStorage) {
        //logDebug(`Token Tracker storage flush: ${this.dirtyTracking.size} puts.  ${this.deletedKeys.size} deletes.`);
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

        const versionPromise = this.migrationFlag.flushToStorage(storage);

        await Promise.all([putPromise, deletePromise, versionPromise]);
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
        a.symbol === b.symbol &&
        a.tokenType === b.tokenType;
    }
    private async maybePerformMigration(storage : DurableObjectStorage) : Promise<'proceed'|'early-out'> {
        // version migration
        if (this.migrationFlag.value === 'no-token-type') {
            logDebug("Performing version migration");
            await this.rebuildTokenList(storage).then(async (success) => {
                if (success) {
                    this.migrationFlag.value = 'has-token-type';
                    await this.flushToStorage(storage);
                    logDebug('Completed version migration')
                }
            }).catch((r : any) => {
                logDebug(`Version migration failed: ${r.toString()}`);
            });
            return 'early-out';
        }
        return 'proceed';
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