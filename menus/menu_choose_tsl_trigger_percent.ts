import { Env } from "../env";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export interface ChooseTSLTriggerPercentMenuParams {
    // "Pick the percentage below the latest peak price that the position should be automatically sold.";
    text: string,
    // MenuCode.SubmitTriggerPct
    submitMenuCode : MenuCode,
    // MenuCode.ReturnToPositionRequestEditor
    backMenuCode: MenuCode, 
    // MenuCode.CustomTriggerPct
    customTSLTriggerPercentMenuCode : MenuCode,
    defaultCustomTSLTriggerPercent : number
}

export class MenuChooseTSLTriggerPercent extends Menu<number> implements MenuCapabilities {
    params : ChooseTSLTriggerPercentMenuParams
    constructor(params : ChooseTSLTriggerPercentMenuParams, defaultCustomTriggerPct : number, env : Env) {
        super(defaultCustomTriggerPct, env);
        this.params = params;
    }

    renderText(): string {
        return this.params.text;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        const submitCode = this.params.submitMenuCode;
        const defaultCustomTriggerPercent = this.menuData;
        this.insertButtonNextLine(options, "1%", new CallbackData(submitCode,  "1"));
        this.insertButtonSameLine(options, "5%", new CallbackData(submitCode,  "5"));
        this.insertButtonSameLine(options, "10%", new CallbackData(submitCode, "10"));
        this.insertButtonSameLine(options, "X%", new CallbackData(this.params.customTSLTriggerPercentMenuCode, defaultCustomTriggerPercent.toString()));
        this.insertButtonNextLine(options, ":back: Back", new CallbackData(this.params.backMenuCode));
        return options;
    }
}