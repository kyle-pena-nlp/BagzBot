import { DurableObjectStorage } from "@cloudflare/workers-types";
import { DecimalizedAmount, MATH_DECIMAL_PLACES, fromNumber } from "../../../decimalized";
import { Env } from "../../../env";
import { logError } from "../../../logging";
import { calculatePriceUsingQuote } from "../../../rpc/jupiter_quotes";
import { isGetQuoteFailure } from "../../../rpc/rpc_types";
import { TokenInfo, getVsTokenInfo } from "../../../tokens";
import { ChangeTrackedValue, strictParseBoolean } from "../../../util";

export class CurrentPriceTracker {
    private currentPrice : ChangeTrackedValue<DecimalizedAmount|null> = new ChangeTrackedValue<DecimalizedAmount|null>("currentPrice", null);
    private priceLastRefreshed : ChangeTrackedValue<number> = new ChangeTrackedValue<number>("priceLastRefreshed", 0);
    initialize(entries : Map<string,any>) {
        this.currentPrice.initialize(entries);
        this.priceLastRefreshed.initialize(entries);
    }
    
    async flushToStorage(storage : DurableObjectStorage) {
        const p1 = this.currentPrice.flushToStorage(storage);
        const p2 = this.priceLastRefreshed.flushToStorage(storage);
        // deliberately not flushing tokenAddress or vsTokenAddress.
        return await Promise.allSettled([p1,p2]);
    }
    // Update price from an external source. Returns updated price is price was updated.  Otherwise null.
    maybeAcceptPrice(maybeNewerPrice : DecimalizedAmount, priceDateMS : number) : DecimalizedAmount|null {
        if (this.priceLastRefreshed.value < priceDateMS) {
            this.currentPrice.value = maybeNewerPrice;
            this.priceLastRefreshed.value = priceDateMS;
            return maybeNewerPrice;
        }
        return null;
    }
    async getPrice(token : TokenInfo, vsTokenAddress : string, env : Env) : Promise<[DecimalizedAmount,boolean]|null> {
        if (this.priceIsStale()) {
            const price = await this.getPriceInternal(token,getVsTokenInfo(vsTokenAddress), env);
            if (price != null) {
                this.currentPrice.value = price;
                this.priceLastRefreshed.value = Date.now();
                return [price,true]
            }
            return null;
        }
        if (this.currentPrice.value == null) {
            return null;
        }
        else {
            return [this.currentPrice.value,false];
        }
    }
    private priceIsStale() {
        return (Date.now() - this.priceLastRefreshed.value) > 1000;
    }
    private async getPriceInternal(token : TokenInfo, vsToken : TokenInfo, env : Env) : Promise<DecimalizedAmount|undefined> {
        if (strictParseBoolean(env.POLL_PRICE_USING_JUPITER_QUOTE_API)) {
            return await this.getPriceUsingJupiterQuoteAPI(token,vsToken,env);
        }
        else {
            return await this.getPriceFromJupiter(token.address, vsToken.address);
        }
    }
    private async getPriceUsingJupiterQuoteAPI(token: TokenInfo, vsToken : TokenInfo, env : Env) : Promise<DecimalizedAmount|undefined> {
        const price = await calculatePriceUsingQuote(token, vsToken, env);
        if (isGetQuoteFailure(price)) {
            return undefined;
        }
        return price;
    }
    private async getPriceFromJupiter(tokenAddress : string, vsTokenAddress : string) : Promise<DecimalizedAmount|undefined> {
        const url = `https://price.jup.ag/v6/price?ids=${tokenAddress}&vsToken=${vsTokenAddress}`;
        const response = await fetch(url);
        if (!response.ok) {
            logError("Response from jupiter price API not ok.", this);
            return;
        }
        const responseBody : any = (await response.json());
        // If the token gets delisted by jupiter this can happen.
        // TODO: put rugged tokens in 'dead letter' state
        if (!(tokenAddress in responseBody.data)) {
            return undefined;
        }
        const price = responseBody.data[tokenAddress].price;
        const decimalizedPrice = fromNumber(price, MATH_DECIMAL_PLACES);
        return decimalizedPrice;
    }
}