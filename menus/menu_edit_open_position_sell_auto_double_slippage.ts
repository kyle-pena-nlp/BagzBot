import { CallbackButton } from "../telegram";
import { addAutoDoubleSlippageVerbiage } from "./auto_double_slippage_verbiage";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";
import { PositionIDAndChoice } from "./position_id_and_choice";

export class MenuEditOpenPositionSellAutoDoubleSlippage extends Menu<string> implements MenuCapabilities {
    renderText(): string {
        const lines : string[] = [];
        addAutoDoubleSlippageVerbiage(lines);
        return lines.join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const positionID = this.menuData;
        const options = this.emptyMenu();
        
        const trueChoice = new PositionIDAndChoice(positionID, true);
        this.insertButtonNextLine(options, 'On Sell - Auto-Double Slippage', new CallbackData(MenuCode.SubmitOpenPositionAutoDoubleSlippage, trueChoice.asMenuArg()));

        const falseChoice = new PositionIDAndChoice(positionID, false);
        this.insertButtonNextLine(options, 'On Sell - Do Not Auto-Double Slippage', new CallbackData(MenuCode.SubmitOpenPositionAutoDoubleSlippage, falseChoice.asMenuArg()));
        
        this.insertButtonNextLine(options, ':back: Back', new CallbackData(MenuCode.ViewOpenPosition, positionID));

        return options;
    }
}