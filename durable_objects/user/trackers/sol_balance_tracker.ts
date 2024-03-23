import { DurableObjectStorage } from "@cloudflare/workers-types";
import { DecimalizedAmount } from "../../../decimalized";
import { Env } from "../../../env";
import { getSOLBalance } from "../../../rpc/rpc_wallet";
import { getVsTokenInfo } from "../../../tokens";
import { ChangeTrackedValue, strictParseFloat } from "../../../util";

// provides persisted and rate-limited access to wallet SOL balance.
export class SOLBalanceTracker {

    // TODO : to change tracked value
    maybeSOLBalance : ChangeTrackedValue<DecimalizedAmount|undefined> = new ChangeTrackedValue<DecimalizedAmount|undefined>('maybeSOLBalance', undefined);
    lastRefreshedSOLBalance : ChangeTrackedValue<number> = new ChangeTrackedValue<number>('lastRefreshedSOLBalance', 0); // ms since epoch

    constructor() {
    }

    initialize(entries : Map<string,any>) {
        this.maybeSOLBalance.initialize(entries);
        this.lastRefreshedSOLBalance.initialize(entries);
    }

    async flushToStorage(storage : DurableObjectStorage) {
        const flushSOLBalance = this.maybeSOLBalance.flushToStorage(storage);
        const flushLastRefresh = this.lastRefreshedSOLBalance.flushToStorage(storage);
        return await Promise.allSettled([flushSOLBalance,flushLastRefresh]);
    }

    async maybeGetBalance(address : string|undefined, forceRefresh : boolean, env : Env) : Promise<DecimalizedAmount|undefined> {
        if (address == null) {
            return;
        }
        if (this.refreshIntervalExpired(env) || forceRefresh) {
            const refreshedBalance = await this.getBalanceFromRPC(address, env);
            if (refreshedBalance != null) {
                this.maybeSOLBalance.value = refreshedBalance;
                this.lastRefreshedSOLBalance.value = Date.now();
            }
        }
        return this.maybeSOLBalance.value;
    }

    private refreshIntervalExpired(env : Env) {
        return (Date.now()  - this.lastRefreshedSOLBalance.value) > strictParseFloat(env.WALLET_BALANCE_REFRESH_INTERVAL_MS);
    }

    private async getBalanceFromRPC(address : string, env : Env) : Promise<DecimalizedAmount|undefined> {
        const solLamportsBalance = await getSOLBalance(address, env).catch(r => undefined);
        if (solLamportsBalance == null) {
            return;
        }
        return {
            tokenAmount : solLamportsBalance.toString(),
            decimals: getVsTokenInfo('SOL').decimals
        };
    }
}

