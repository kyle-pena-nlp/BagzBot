import { ChangeTrackedValue } from "../../../util";

export class UserSettingsTracker {

    quickBuyEnabled : ChangeTrackedValue<boolean> = new ChangeTrackedValue<boolean>("settings.QuickBuyEnabled", false);
    quickBuySOLAmount : ChangeTrackedValue<number|null> = new ChangeTrackedValue<number|null>("settings.QuickBuySOLAmount", null);
    quickBuyPriorityFee : ChangeTrackedValue<'auto'|number|null> = new ChangeTrackedValue<'auto'|number|null>("settings.QuickBuyPriorityFee", null);
    quickBuySlippagePct : ChangeTrackedValue<number|null> = new ChangeTrackedValue<number|null>("settings.quickBuySlippagePct", null);
    quickBuyTSLTriggerPct: ChangeTrackedValue<number|null> = new ChangeTrackedValue<number|null>("settings.quickBuyTSLTriggerPct", null);
    quickBuyAutoDoubleSlippage : ChangeTrackedValue<boolean|null> = new ChangeTrackedValue<boolean|null>("settings.QuickBuyAutoDoubleSlippage", null);

    initialize(entries : Map<string,any>) {
        this.quickBuyEnabled.initialize(entries);
        this.quickBuySOLAmount.initialize(entries);
        this.quickBuyPriorityFee.initialize(entries);
        this.quickBuySlippagePct.initialize(entries);
        this.quickBuyTSLTriggerPct.initialize(entries);
        this.quickBuyAutoDoubleSlippage.initialize(entries);
    }

    async flushToStorage(storage : DurableObjectStorage) {
        await Promise.allSettled([
            this.quickBuyEnabled.flushToStorage(storage),
            this.quickBuySOLAmount.flushToStorage(storage),
            this.quickBuyPriorityFee.flushToStorage(storage),
            this.quickBuySlippagePct.flushToStorage(storage),
            this.quickBuyTSLTriggerPct.flushToStorage(storage),
            this.quickBuyAutoDoubleSlippage.flushToStorage(storage)
        ]);
    }
}