import { Env } from "../env";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export interface ChooseSlippagePctParams {
    text : string,
    submitMenuCode : MenuCode,
    backMenuCode : MenuCode,
    chooseCustomSlippagePctMenuCode: MenuCode
    defaultCustomSlippagePercent : number
}

export class MenuChooseSlippagePercent extends Menu<number> implements MenuCapabilities {
    params : ChooseSlippagePctParams
    constructor(params : ChooseSlippagePctParams, env : Env) {
        super(params.defaultCustomSlippagePercent, env);
        this.params = params;
    }
    renderText(): string {
        return this.params.text;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        const defaultCustomSlippagePercentage = this.menuData;
        const submitValueCode = this.params.submitMenuCode;
        this.insertButtonNextLine(options, "0.5%", new CallbackData(submitValueCode, "0.5"));
        this.insertButtonSameLine(options, "1.0%", new CallbackData(submitValueCode, "1.0"));
        this.insertButtonSameLine(options, "2.0%", new CallbackData(submitValueCode, "2.0"));
        this.insertButtonSameLine(options, "X%", new CallbackData(this.params.chooseCustomSlippagePctMenuCode, defaultCustomSlippagePercentage.toString()));
        this.insertButtonNextLine(options, ":back: Back", new CallbackData(this.params.backMenuCode));
        return options;
    }
}