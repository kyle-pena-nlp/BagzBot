import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { logoHack } from "./logo_hack";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class LegalAgreement extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        return this.renderLegalAgreementText();
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, "Agree", new CallbackData(MenuCode.LegalAgreementAgree));
        this.insertButtonNextLine(options, "Refuse", new CallbackData(MenuCode.LegalAgreementRefuse));
        return options;
    }
    renderLegalAgreementText() : string {
        let LEGAL_AGREEMENT_TEXT = `${logoHack()} <u><b>Welcome to ${this.env.TELEGRAM_BOT_DISPLAY_NAME}</b></u>

To use ${this.env.TELEGRAM_BOT_DISPLAY_NAME} you must agree to the following Terms Of Service.

I. You use this bot at your own risk.  

II. To the greatest extent permitted by law, we are not liable for any damages, regardless of origin, cause, or fault, including malfunctioning of the bot itself.

III. Additionally, the user understands that the bot is in BETA and the risks that using a BETA product entails.

IV. By agreeing to this notice and/or using the bot in any capacity, you affirm you are: 
    i.   Legally permitted to use the bot in your jurisdiction
    ii.  Affirm that you will not use the bot for any purposes other than which is intended
    iii. Or for purposes which are illegal in your jurisdiction.
    
By choosing 'Agree' and/or continuing to use the bot, you affirm and agree to all of the above.`;    

        
        return LEGAL_AGREEMENT_TEXT;
    }

    renderURLPreviewNormally(): boolean {
        return false;
    }
}

