import { CallbackButton } from "../telegram";
import { logoHack } from "./logo_hack";
import { Menu, MenuCapabilities } from "./menu";

export class MenuFAQ extends Menu<{ botName : string, botInstance : string, botTagline : string, userID : number, chatID : number }> implements MenuCapabilities {
    renderText(): string {
        return this.renderFAQ();
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertBackToMainButtonOnNewLine(options);
        return options;
    }   
    renderFAQ() : string {
        const botName = this.menuData.botName;
        const botInstance = this.menuData.botInstance;
        const botTagline = this.menuData.botTagline;
        return `${logoHack()}<b>${botName} - ${botInstance}</b>
<i>${botTagline}</i>

<b>What is ${botName}?</b>
${botName} is a Telegram Bot with a focus on <b>locking in your gains</b> and <b>limiting your losses</b>..
${botName} tracks the value of your token, and remembers when it hits an all-time high (a "peak" :mountain:).
The moment the token falls 5% below the :mountain:, the trade automatically sells.
You can customize 5% to some other percentage if you like.

<b>What Tokens Can I Trade?</b>
You can trade any token that is supported by Jupiter.  
There may be a few minutes lag between Jupiter listing a coin and it becoming available on the bot.

<b>How do I get funds into my ${botName} wallet?</b>
View your Wallet in the Main Menu.  Click on the address to copy it.  
Then, send SOL to your wallet using the Solana Wallet app of your choice.
ALWAYS send a small test amount first before sending larger amounts of SOL.

<b>How do you keep my ${botName} Wallet's private keys safe?</b>
1. We never store any private keys in plaintext.
2. When the private key is needed for signing transactions or is requested by the user, it is decrypted
at the last possible moment, and with a decryption key that is unique per-user. 
3. When private keys are sent to the user, they are sent over Telegram's secure communication channels.
4. Administrators do not have the ability to view your private key.

<b>Disclaimer</b>
You use ${botName} at your own risk, without exceptions!
We are not responsible for any losses, regardless of cause, origin, or fault.

<b>Support Information</b>
:bullet: User ID: ${this.menuData.userID}`;
    }

    renderURLPreviewNormally(): boolean {
        return false;
    }
}
