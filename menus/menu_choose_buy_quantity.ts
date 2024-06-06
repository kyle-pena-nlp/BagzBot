import { QuantityAndToken } from "../durable_objects/user/model/quantity_and_token";
import { Env, getCommonEnvironmentVariables } from "../env";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export interface BuyQuantityMenuParams {
    // return `Choose ${this.menuData.quantityAndToken.thisTokenSymbol} quantity`;
    text: string,
    // SubmitBuyQuantity
    submitMenuCode : MenuCode,
    // ReturnToPositionRequestEditor
    backMenuCode : MenuCode,
    // CustomBuyQuantity
    customBuyQuantityMenuCode : MenuCode
}

export class MenuChooseBuyQuantity extends Menu<{ quantityAndToken: QuantityAndToken }> implements MenuCapabilities {
    params: BuyQuantityMenuParams
    constructor(params : BuyQuantityMenuParams, quantityAndToken: { quantityAndToken: QuantityAndToken }, env : Env) {
        super(quantityAndToken, env);
        this.params = params;
    }
    renderText(): string {
        return this.params.text;
    }
    renderOptions(): CallbackButton[][] {

        const symbol = this.menuData.quantityAndToken.thisTokenSymbol;
        const options = this.emptyMenu();
        
        let amounts = [];

        if (getCommonEnvironmentVariables(this.env).isBeta) {
            amounts = [0.01,0.1,0.25,0.5];
        }
        else {
            amounts = [0.1,1,5];
        }

        for (const amount of amounts) {
            this.insertButtonSameLine(options, `${amount} ${symbol}`, new CallbackData(this.params.submitMenuCode, amount.toString()));
        }

        this.insertButtonSameLine(options, `X ${symbol}`, new CallbackData(this.params.customBuyQuantityMenuCode, this.menuData.quantityAndToken.quantity.toString()));
        this.insertButtonNextLine(options, ":back: Back", new CallbackData(this.params.backMenuCode));
        
        return options;
    }
}