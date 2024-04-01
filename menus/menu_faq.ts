import { CallbackButton } from "../telegram";
import { Menu, MenuCapabilities } from "./menu";

export class MenuFAQ extends Menu<{ botName : string, botInstance : string, botTagline : string }> implements MenuCapabilities {
    renderText(): string {
        return this.renderFAQ();
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertBackToMainButtonOnNewLine(options);
        return options;
    }
    parseMode(): "MarkdownV2" | "HTML" {
        return 'HTML';
    }    
    renderFAQ() : string {
        const botName = this.menuData.botName;
        const botInstance = this.menuData.botInstance;
        const botTagline = this.menuData.botTagline;
        return `<b>${botName} - ${botInstance}</b>
<i>${botTagline}</i>

<b>What is ${botName}?</b>
${botName} is a Telegram Bot with a focus on locking in your gains.
${botName} tracks the value of your token, and remembers when it hits an all-time high (a "peak" :mountain:).
The moment the token falls 5% below the :mountain:, the trade automatically sells.
You can customize 5% to some other percentage if you like.

<b>OK, so what?</b>
You buy a sh**coin, it's looking good.  You get tired, you fall asleep.
The coin hits its peak at 4:30 AM, and then plummets to 10% of value by 5:30 AM.
You wake up at 9:00 AM, you realize you missed your opportunity.  You question your life choices.
${botName} fixes that by automatically selling when the token comes off the peak.
This locks in your gains.

<b>What Tokens Can I Trade?</b>
You can trade any token that is supported by Jupiter.  
There may be a few minutes lag between Jupiter listing a coin and it becoming available on the bot.

<b>Why are all prices in terms of SOL, and why does ${botName} not allow swapping to/from $USDT/$USDC, or tokens from other chains?</b>
1 SOL = 1 SOL.

<b>Why don't I have to connect to a Wallet?</b>
${botName} automatically creates a personal wallet just for you.
If you want to take control of the wallet yourself, you can view its private key in the "Wallet" menu.
Please note - any transfers of non-SOL tokens are not currently synced with the bot.

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

<b>What features do you have planned?</b>
1. <b>Auto-Buy</b>: Automatically buys a token when certain conditions are met
2. <b>DCA Out</b>: Begins a DCA when the Trigger Percent condition is met.
3. <b>Wave Rider</b>: Buys back in when the price starts going back up.  You're riding the waves!
4. <b>Early Token Access</b>: Realtime access to fresh-minted coins - no waiting for Jupiter.

<b>Disclaimer</b>
You use ${botName} at your own risk, without exceptions!
We are not responsible for any losses, regardless of cause, origin, or fault.
`;
    }
}
