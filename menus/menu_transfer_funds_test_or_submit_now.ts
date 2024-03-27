import { CompleteTransferFundsRequest } from "../rpc/rpc_transfer_funds";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuTransferFundsTestOrSubmitNow extends Menu<CompleteTransferFundsRequest> implements MenuCapabilities {
    renderText(): string {
        return `Would you like to perform a test with a small amount of SOL before transferring ${this.menuData.solQuantity} SOL?`
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, "Yes", new CallbackData(MenuCode.TransferFundsDoTestTransfer));
        this.insertButtonNextLine(options, "No - just do it", new CallbackData(MenuCode.TransferFundsDoTransfer));
        return options;
    }
    parseMode(): "MarkdownV2" | "HTML" {
        return "HTML";
    }
    renderURLPreviewNormally(): boolean {
        return true;
    }
}