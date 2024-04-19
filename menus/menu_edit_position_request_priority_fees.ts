import { CallbackButton } from "../telegram";
import { FormattedTable } from "../util";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuEditPositionRequestPriorityFees extends Menu<number[]> implements MenuCapabilities {
    renderText(): string {
        
        const lines = [
            `<b><u>Priority Fees Help Your Trade Get Executed First</u></b>`,
        ];

        const table = new FormattedTable([10], 'bulleted');

        table.addLine(`Default`, '75th percentile of recent priority fees');

        for (const multiplier of this.menuData) {
            table.addLine(`${multiplier}x`, `${multiplier} times the Default`);
        }

        table.appendTo(lines);
        
        return lines.join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, "Default", new CallbackData(MenuCode.EditPositionRequestSubmitPriorityFees, "auto"));
        for (const multiplier of this.menuData) {
            this.insertButtonSameLine(options, `${multiplier}x`, new CallbackData(MenuCode.EditPositionRequestSubmitPriorityFees, multiplier.toString()));
        }
        this.insertButtonNextLine(options, ':cancel: Cancel', this.menuCallback(MenuCode.ReturnToPositionRequestEditor))
        return options;
    }
    
}