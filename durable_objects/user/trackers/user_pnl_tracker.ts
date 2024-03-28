import { DurableObjectStorage } from "@cloudflare/workers-types";
import { dAdd, dDiv, dMult } from "../../../decimalized";
import { MATH_DECIMAL_PLACES, dZero, fromNumber } from "../../../decimalized/decimalized_amount";
import { Env } from "../../../env";
import { ChangeTrackedValue, strictParseFloat } from "../../../util";
import { listPositionsByUser } from "../../token_pair_position_tracker/token_pair_position_tracker_DO_interop";
import { TokenPair } from "../model/token_pair";
import { UserPNL } from "../model/user_data";

// provides persisted and rate-limited access to wallet SOL balance.
export class UserPNLTracker {

    // TODO : to change tracked value
    maybeUserPNL : ChangeTrackedValue<UserPNL|null> = new ChangeTrackedValue<UserPNL|null>('maybeUserPNL', null);
    lastRefreshedSOLBalance : number = 0; //ChangeTrackedValue<number> = new ChangeTrackedValue<number>('lastRefreshedSOLBalance', 0); // ms since epoch
    
    constructor() {
    }

    initialize(entries : Map<string,any>) {
        this.maybeUserPNL.initialize(entries);
    }

    async flushToStorage(storage : DurableObjectStorage) {
        const flushPNL = this.maybeUserPNL.flushToStorage(storage);
        return await Promise.allSettled([
            flushPNL
        ]);
    }
    
    async maybeGetPNL(telegramUserID : number, uniqueTokenPairs : TokenPair[], forceRefresh : boolean, env : Env) : Promise<UserPNL|null> {
        let PNL = dZero();
        let originalTotalValue = dZero();
        let currentTotalValue = dZero();
        if (this.refreshIntervalExpired(env) || forceRefresh) {
            for (const tokenPair of uniqueTokenPairs) {
                const positionsWithPNL = await listPositionsByUser(telegramUserID, tokenPair.tokenAddress, tokenPair.vsTokenAddress, env);
                for (const positionWithPNL of positionsWithPNL) {
                    if (positionWithPNL.PNL == null) {
                        return null;
                    }
                    originalTotalValue = dAdd(originalTotalValue, positionWithPNL.position.vsTokenAmt);
                    currentTotalValue = dAdd(currentTotalValue, positionWithPNL.PNL.currentValue);
                    PNL = dAdd(PNL, positionWithPNL.PNL.PNL)
                }
            }
            const PNLpercent = dMult(dDiv(PNL, originalTotalValue, MATH_DECIMAL_PLACES), fromNumber(100));
            this.maybeUserPNL.value = {
                originalTotalValue: originalTotalValue,
                currentTotalValue: currentTotalValue,
                PNL: PNL,
                PNLpercent: PNLpercent
            }
        }
        return this.maybeUserPNL.value||null;
    }

    private refreshIntervalExpired(env : Env) {
        return (Date.now()  - this.lastRefreshedSOLBalance) > strictParseFloat(env.USER_PNL_CALCULATION_REFRESH_MS);
    }
}

