import { parsePriorityFeeOptions } from "../env";
import { CallbackButton } from "../telegram";
import { FormattedTable } from "../util";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuEditPositionRequestPriorityFees extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        
        const lines = [
            `<b><u>Priority Fees Help Your Trade Get Executed First</u></b>`,
        ];

        const table = new FormattedTable([10], 'bulleted');

        table.addLine(`Default`, '75th percentile of recent priority fees');

        for (const [multiplier,multiplierName] of parsePriorityFeeOptions(this.env)) {
            table.addLine(`${multiplierName}`, `${multiplier} times the Default`);
        }

        table.appendTo(lines);
        
        return lines.join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, "Default", new CallbackData(MenuCode.EditPositionRequestSubmitPriorityFees, "auto"));
        for (const [multiplier,multiplierName] of parsePriorityFeeOptions(this.env)) {
            this.insertButtonSameLine(options, `${multiplierName}`, new CallbackData(MenuCode.EditPositionRequestSubmitPriorityFees, multiplier.toString()));
        }
        this.insertButtonNextLine(options, ':back: Back', this.menuCallback(MenuCode.ReturnToPositionRequestEditor))
        return options;
    }
    
}