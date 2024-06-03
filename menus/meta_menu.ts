import { CallbackButton } from "../telegram";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export interface MetaMenuSpec {
    text: string
    buttons : (string|{text:string,menuCode:MenuCode})[][]
    thisMenuCode : MenuCode
    backMenuCode : MenuCode,
    includeRefresh ?: boolean
}

export class MetaMenu extends Menu<MetaMenuSpec> implements MenuCapabilities {
    renderText(): string {
        return this.menuData.text;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        for (const buttonLine of this.menuData.buttons) {
            if (buttonLine.length == 0) {
                continue;
            }
            const firstButton = buttonLine[0];
            this.renderButtonNextLine(options, firstButton);
            const restButtons = buttonLine.slice(1);
            for (const restButton of restButtons) {
                this.renderButtonSameLine(options, restButton);
            }
        }
        this.insertButtonNextLine(options, ':back: Back', this.menuCallback(this.menuData.backMenuCode));
        if (this.menuData.includeRefresh === true) {
            this.insertButtonSameLine(options, ':refresh: Refresh', this.menuCallback(this.menuData.thisMenuCode));
        }
        this.insertButtonSameLine(options, 'Close', this.menuCallback(MenuCode.Close));
        //this.insertButtonNextLine(options, "Back", this.menuCallback(this.menuData));
        return options;
    }

    renderURLPreviewNormally(): boolean {
        return false;
    }

    private renderButtonNextLine(options : CallbackButton[][], button : string|{text:string,menuCode:MenuCode}) {
        if (typeof button === 'string') {
            this.insertButtonNextLine(options, button, this.menuCallback(this.menuData.thisMenuCode));
        }
        else {
            this.insertButtonNextLine(options, button.text, this.menuCallback(button.menuCode));
        }
    }

    private renderButtonSameLine(options : CallbackButton[][], button : string|{text:string,menuCode:MenuCode}) {
        if (typeof button === 'string') {
            this.insertButtonSameLine(options, button, this.menuCallback(this.menuData.thisMenuCode));
        }
        else {
            this.insertButtonSameLine(options, button.text, this.menuCallback(button.menuCode));
        }
    }
}