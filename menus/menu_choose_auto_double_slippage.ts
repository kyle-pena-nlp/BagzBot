import { EnvironmentVariables } from "../env";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export interface ChooseAutoDoubleSlippageParams {
    // lines = []; addAutoDoubleSlippageVerbiage(lines); lines.join('\r\n');
    text : string
    // MenuCode.SubmitPosRequestAutoDoubleSlippageOptions
    submitMenuCode : MenuCode
    // MenuCode.ReturnToPositionRequestEditor
    backMenuCode : MenuCode
}

export class MenuChooseAutoDoubleSlippage extends Menu<undefined> implements MenuCapabilities {

    params : ChooseAutoDoubleSlippageParams

    constructor(params : ChooseAutoDoubleSlippageParams, env : EnvironmentVariables) {
        super(undefined, env);
        this.params = params;
    }

    renderText(): string {
        return this.params.text;
    }

    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, 'Yes - Auto-Double Slippage', new CallbackData(this.params.submitMenuCode, true.toString()));
        this.insertButtonNextLine(options, 'No - Do Not Auto-Double Slippage', new CallbackData(this.params.submitMenuCode, false.toString()));
        this.insertButtonNextLine(options, ':back: Back', new CallbackData(this.params.backMenuCode));
        return options;
    }
}