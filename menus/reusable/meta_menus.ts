import { Env } from "../../env";
import { CallbackButton } from "../../telegram";
import { CallbackData } from "../callback_data";
import { logoHack } from "../logo_hack";
import { Menu, MenuCapabilities } from "../menu";
import { MenuCode } from "../menu_code";

type Template<T extends object> = {
    [K in keyof T] : string
}[keyof T]

type TextTemplate<T extends object> = `DUMMY TEXT ${Template<T>}`

type TemplateSubstitution<T extends object> = {
    [K in keyof T]: string | (() => string);
};

function renderTemplate<T extends object>(template: string, values: TemplateSubstitution<T>): string {
    let result = template;
    for (const key in values) {
      let subValue = values[key];
      if (typeof subValue !== 'string') {
        subValue = subValue();
      }
      result = result.replace(new RegExp(`\\\${${key}}`, 'g'), subValue);
    }
    return result;
}

export interface MetaMenuOption<T extends object> {
    textTemplate : TextTemplate<T>,
    menuCode : MenuCode,
    menuArgTemplate ?: TextTemplate<T>
}

export interface MetaMenuParams<T extends object> {
    textTemplate : string
    options : MetaMenuOption<T>[][]
    backMenuCode ?: MenuCode
    includeLogo ?: true,
    renderImagePreviewNormally ?: false
}

export class MetaMenu<T extends object> extends Menu<T> implements MenuCapabilities {
    params : MetaMenuParams<T>
    constructor(data : T, params : MetaMenuParams<T>, env : Env) {
        super(data, env)
        this.params = params;
    }
    renderText(): string {
        let text = renderTemplate(this.params.textTemplate, this.menuData);
        if (this.params.includeLogo || false) {
            text = `${logoHack()}` + text;
        }
        return text;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.params.options.forEach((buttonLine,lineIndex) => {
            buttonLine.forEach((button,colIndex) => {
                const renderedButtonText = renderTemplate(button.textTemplate, this.menuData);
                const renderedMenuArg = renderTemplate(button.menuArgTemplate||'', this.menuData);
                const buttonCallbackData = new CallbackData(button.menuCode, renderedMenuArg);
                if (colIndex === 0) {
                    this.insertButtonNextLine(options, renderedButtonText, buttonCallbackData);
                }
                else {
                    this.insertButtonSameLine(options, renderedButtonText, buttonCallbackData);
                }
            });
        });
        return options;
    }
    renderURLPreviewNormally(): boolean {
        return this.params.renderImagePreviewNormally || true;
    }
}

// TODO: pick option menus, custom quantity menus, etc.
// THEN: meta handlers.