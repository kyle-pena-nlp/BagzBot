import { DurableObjectStorage } from "@cloudflare/workers-types";
import { DecimalizedAmount } from "../../../decimalized";
import { Env } from "../../../env";
import { logDebug, logError } from "../../../logging";
import { getSOLBalance } from "../../../rpc/rpc_wallet";
import { getVsTokenInfo } from "../../../tokens";
import { ChangeTrackedValue, strictParseFloat } from "../../../util";

// provides persisted and rate-limited access to wallet SOL balance.
export class SOLBalanceTracker {
    
    maybeSOLBalance : ChangeTrackedValue<DecimalizedAmount|null> = new ChangeTrackedValue<DecimalizedAmount|null>('maybeSOLBalance', null);
    lastRefreshedSOLBalance : number = 0; //ChangeTrackedValue<number> = new ChangeTrackedValue<number>('lastRefreshedSOLBalance', 0); // ms since epoch

    constructor() {
    }

    initialize(entries : Map<string,any>) {
        this.maybeSOLBalance.initialize(entries);
    }

    async flushToStorage(storage : DurableObjectStorage) {
        const flushSOLBalance = this.maybeSOLBalance.flushToStorage(storage);
        return await Promise.allSettled([
            flushSOLBalance
        ]);
    }

    async maybeGetBalance(address : string|undefined, forceRefresh : boolean, env : Env) : Promise<DecimalizedAmount|null> {
        if (address == null) {
            return null;
        }
        if (this.refreshIntervalExpired(env) || forceRefresh) {
            logDebug(`Refreshing SOL balance for ${address}`);
            const startRefreshMS = Date.now();
            const refreshedBalance = await this.getBalanceFromRPC(address, env);
            if (refreshedBalance != null) {
                this.maybeSOLBalance.value = refreshedBalance;
                this.lastRefreshedSOLBalance = Date.now();
                logDebug(`SOL balance refreshed for ${address} in ${Date.now() - startRefreshMS}ms`);
            }
            else {
                logDebug(`SOL balance failed to refresh for ${address}`);
            }
        }
        return this.maybeSOLBalance.value||null;
    }

    private refreshIntervalExpired(env : Env) {
        return (Date.now()  - this.lastRefreshedSOLBalance) > strictParseFloat(env.WALLET_BALANCE_REFRESH_INTERVAL_MS);
    }

    private async getBalanceFromRPC(address : string, env : Env) : Promise<DecimalizedAmount|undefined> {
        const solLamportsBalance = await getSOLBalance(address, env).catch(r => {
            logError(`Retrieving SOL balance failed, address: ${address}`, r);
            return undefined;
        });
        if (solLamportsBalance == null) {
            return;
        }
        return {
            tokenAmount : solLamportsBalance.toString(),
            decimals: getVsTokenInfo('SOL').decimals
        };
    }
}

