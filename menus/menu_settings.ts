import { UserSettings } from "../durable_objects/user/model/user_settings";
import { describePriorityFee } from "../positions";
import { CallbackButton } from "../telegram";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuSettings extends Menu<UserSettings> implements MenuCapabilities {
    renderText(): string {
        return `Manage your settings for Quick Buys here.  Quick Buys let you purchase TSL Positions just by sending the bot a token address.`;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        
        this.insertButtonNextLine(options, `Quick Buy Enabled: ${this.menuData.quickBuyEnabled ? 'Yes' : 'No' }`, this.menuCallback(MenuCode.ChooseQuickBuyEnabled));
        this.insertButtonNextLine(options, `Quick Buy SOL Amount: ${this.menuData.quickBuySOLAmount} SOL`, this.menuCallback(MenuCode.ChooseQuickBuySOLAmount));
        this.insertButtonNextLine(options, `Quick Buy TSL Trigger: ${this.menuData.quickBuyTSLTriggerPct.toString(10)}%`, this.menuCallback(MenuCode.ChooseQuickBuyTSLTriggerPercent));
        this.insertButtonNextLine(options, `Quick Buy Priority Fee: ${describePriorityFee(this.menuData.quickBuyPriorityFee, this.env)}`, this.menuCallback(MenuCode.ChooseQuickBuyPriorityFee));
        this.insertButtonNextLine(options, `Quick Buy Slippage: ${this.menuData.quickBuySlippagePct}%`, this.menuCallback(MenuCode.ChooseQuickBuySlippagePct));

        return options;
    }
}