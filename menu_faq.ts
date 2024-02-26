import { Menu, MenuCapabilities } from "./menu";
import { MenuCode, CallbackButton, MenuSpec } from "./common";

export class MenuFAQ extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        return FAQ_STRING;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertReturnToMainButtonOnNewLine(options);
        return options;
    }
    parseMode(): "MarkdownV2" | "HTML" {
        return 'HTML';
    }    
    forceResponse() : boolean {
        return true;
    }
}

const FAQ_STRING = `<b>What is Bagz Bot?</b>

<b>Bagz Bot</b> lets you perform automated crypto trades through a Telegram bot.

<b>How Does It Work?</b>

The <b>Bagz Bot</b> creates a <b>Bagz Bot Wallet</b> for you.  After you fund the wallet with USDC, you can 
place automated trades of your choosing and <b>Bagz Bot</b> will do the rest.  
You can withdrawal funds or manually close your positions any time you like.
You can also request the <b>Bagz Bot Wallet</b> private keys at any time to transfer the wallet to private ownership.

<b>Does Bagz Bot Cost Anything To Use?</b>
The <b>Bagz Bot</b> keeps 0.5% of any return on a position, or $1.00, whichever is greater.
You can also include Priority Fees which may help your trade be executed before other trades.
Priority Fees are completely optional, and are passed onto the DEX rather than kept by the bot.

<b>What Kind of Positions Can I Open?</b>

<b>Auto-Sell</b>
The <b>Auto-Sell</b> position automatically closes your position when the current price in USDC 
drops below "X percent" off the highest price since you opened the position.  You chose the "X".
For example, if you choose "10 percent",
	and the token is priced at <b>$0.50</b> when you open the position, 
	rises to a peak of <b>$1.00</b>, 
	and then drops to <b>$0.90</b>,
	then this loss of 10% would trigger the <b>Bagz Bot</b> to close the position.
You can set slippage tolerance levels when you open the trade.  
If the position is not completely closed due to slippage, the bot will continue to attempt
to sell the position off at the same level of slippage as long as the X% criteria is still in play.

<b>Where Can I Find Support?</b>

Check out our official Discord Community.

<b>Legal</b>

See here for Legal.
`