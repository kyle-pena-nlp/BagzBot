import { Env } from "../env";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export interface PickOneParams {
    text : string
    options : { text: string, menuArg : string }[]
    submitMenuCode : MenuCode
    backMenuCode : MenuCode
    orientation : 'horizontal'|'vertical'
}

export class MenuPickOne extends Menu<undefined> implements MenuCapabilities {
    params : PickOneParams
    constructor(params: PickOneParams, env : Env) {
        super(undefined, env);
        this.params = params;
    }
    renderText(): string {
        return this.params.text;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        let i = 0;
        const newButtonFn = {
            'horizontal': this.insertButtonSameLine,
            'vertical': this.insertButtonNextLine
        }[this.params.orientation];
        for (const option of this.params.options) {
            if (i == 0) {
                this.insertButtonNextLine(options, option.text, new CallbackData(this.params.submitMenuCode, option.menuArg));
            }
            else {
                newButtonFn(options, option.text, new CallbackData(this.params.submitMenuCode, option.menuArg));
            }
            i += 1;
        }
        this.insertButtonNextLine(options, ':back: Back', this.menuCallback(this.params.backMenuCode));
        return options;
    }
}