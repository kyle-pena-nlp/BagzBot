import { DurableObjectStorage } from "@cloudflare/workers-types";
import { DecimalizedAmount, MATH_DECIMAL_PLACES, fromNumber } from "../../../decimalized";
import { logError } from "../../../logging";
import { ChangeTrackedValue } from "../../../util";

export class CurrentPriceTracker {
    currentPrice : ChangeTrackedValue<DecimalizedAmount|null> = new ChangeTrackedValue<DecimalizedAmount|null>("currentPrice", null);
    priceLastRefreshed : ChangeTrackedValue<number> = new ChangeTrackedValue<number>("priceLastRefreshed", 0);
    tokenAddress : ChangeTrackedValue<string|null> = new ChangeTrackedValue<string|null>("tokenAddress", null);
    vsTokenAddress : ChangeTrackedValue<string|null> = new ChangeTrackedValue<string|null>("vsTokenAddress",null);
    initialize(entries : Map<string,any>) {
        this.currentPrice.initialize(entries);
        this.priceLastRefreshed.initialize(entries);
        this.tokenAddress.initialize(entries);
        this.vsTokenAddress.initialize(entries);
    }
    async flushToStorage(storage : DurableObjectStorage) {
        const p1 = this.currentPrice.flushToStorage(storage);
        const p2 = this.priceLastRefreshed.flushToStorage(storage);
        // deliberately not flushing tokenAddress or vsTokenAddress.
        return await Promise.allSettled([p1,p2]);
    }
    async getPrice() : Promise<DecimalizedAmount|null> {
        if (this.priceIsStale()) {
            const price = await this.getPriceFromJupiter();
            if (price != null) {
                this.currentPrice.value = price;
                this.priceLastRefreshed.value = Date.now();
            }
            return price||null;
        }
        return this.currentPrice.value;
    }
    private priceIsStale() {
        return (Date.now() - this.priceLastRefreshed.value) > 500;
    }
    private async getPriceFromJupiter() : Promise<DecimalizedAmount|undefined> {
        const tokenAddress = this.tokenAddress.value!!;
        const vsTokenAddress = this.vsTokenAddress.value!!;
        const url = `https://price.jup.ag/v4/price?ids=${tokenAddress}&vsToken=${vsTokenAddress}`;
        const response = await fetch(url);
        if (!response.ok) {
            logError("Response from jupiter price API not ok.", this);
            return;
        }
        const responseBody : any = (await response.json());
        const price = responseBody.data[tokenAddress].price;
        const decimalizedPrice = fromNumber(price, MATH_DECIMAL_PLACES);
        return decimalizedPrice;
    }
}