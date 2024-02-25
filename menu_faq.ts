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
        return 'MarkdownV2';
    }    
    forceResponse() : boolean {
        return true;
    }
}

const FAQ_STRING = `# What is Bagz Bot?
**Bagz Bot** lets you perform automated crypto trades through a Telegram bot.

# How Does It Work?

The **Bagz Bot** creates a **Bagz Bot Wallet** for you.  After you fund the wallet with USDC, you can 
place automated trades of your choosing and **Bagz Bot** will do the rest.  
You can withdrawal funds or manually close your positions any time you like.
You can also request the **Bagz Bot Wallet** private keys at any time to transfer the wallet to private ownership.

# Does Bagz Bot Cost Anything To Use?
The **Bagz Bot** keeps 0.5% of any return on a position, or $1.00, whichever is greater.
You can also include Priority Fees which may help your trade be executed before other trades.
Priority Fees are completely optional, and are passed onto the DEX rather than kept by the bot.

# What Kind of Positions Can I Open?

## Protecc Ur Long Bagz
The **Protecc Ur Long Bagz** position automatically closes your position when the current price in USDC 
drops below "X percent" off the highest price since you opened the position.  You chose the "X".
For example, if you choose "10 percent",
	and the token is priced at **$0.50** when you open the position, 
	rises to a peak of **$1.00**, 
	and then drops to **$0.90**,
	then this loss of 10% would trigger the **Bagz Bot** to close the position.
You can set slippage tolerance levels when you open the trade.  
If the position is not completely closed due to slippage, the bot will continue to attempt
to sell the position off at the same level of slippage as long as the X% criteria is still in play.

# Where Can I Find Support?

Check out our official Discord Community.

# Legal

See here for Legal.
`