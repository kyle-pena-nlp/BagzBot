import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";
import { PositionIDAndChoice } from "./position_id_and_choice";

export class MenuEditOpenPositionSellAutoDoubleSlippage extends Menu<string> implements MenuCapabilities {
    renderText(): string {
        const lines = ['Choose whether you would like to automatically double the slippage percent every time the auto-sell fails due to slippage tolerance being exceeded.'];
        lines.push('If you do not choose to auto-double and the price drops very rapidly, you may not get out quickly');
        lines.push('But if you choose to auto-double, you may lose out on profits if the token recovers or does not drop as rapidly.');
        lines.push('Use your best judgment.')
        return lines.join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const positionID = this.menuData;
        const options = this.emptyMenu();
        
        const trueChoice = new PositionIDAndChoice(positionID, true);
        this.insertButtonNextLine(options, 'Yes - Auto-Double', new CallbackData(MenuCode.SubmitOpenPositionAutoDoubleSlippage, trueChoice.asMenuArg()));

        const falseChoice = new PositionIDAndChoice(positionID, false);
        this.insertButtonNextLine(options, 'No - Do Not Auto-Double', new CallbackData(MenuCode.SubmitOpenPositionAutoDoubleSlippage, falseChoice.asMenuArg()));
        
        this.insertButtonNextLine(options, 'Back', new CallbackData(MenuCode.ViewOpenPosition, positionID));

        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        throw new Error("Method not implemented.");
    }
    renderURLPreviewNormally(): boolean {
        throw new Error("Method not implemented.");
    }

}