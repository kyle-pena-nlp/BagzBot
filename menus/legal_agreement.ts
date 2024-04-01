import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class LegalAgreement extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        return LEGAL_AGREEMENT_TEXT;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, "Agree", new CallbackData(MenuCode.LegalAgreementAgree));
        this.insertButtonNextLine(options, "Refuse", new CallbackData(MenuCode.LegalAgreementRefuse));
        return options;
    }
}

const LEGAL_AGREEMENT_TEXT = `You use this bot at your own risk.  
We are not liable for any damages, regardless of origin, cause, or fault, including malfunctioning of the bot itself.
Additionally, the user understands that the bot is in BETA and the risks that using a BETA product entails.
By agreeing to this notice and/or using the bot in any capacity, you affirm you are legally permitted to use 
the bot in your legal jurisdiction, and you affirm that you will not use the bot for any purposes 
other than which is intended, or for purposes which are illegal in your jurisdiction.`;