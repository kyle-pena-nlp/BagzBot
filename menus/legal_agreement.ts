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
    parseMode(): "MarkdownV2" | "HTML" {
        return 'HTML';
    }
    renderURLPreviewNormally(): boolean {
        return true;
    }
}

const LEGAL_AGREEMENT_TEXT = `<b>Cryptocurrency Token Trading Bot User Agreement</b>
1. Introduction
This User Agreement ("Agreement") is a contract between you ("User", "you", or "your") and [Company Name] ("Company", "we", "us", or "our") and governs your use of the cryptocurrency token trading bot ("Bot"). By using the Bot, you agree to be bound by the terms and conditions of this Agreement, our Privacy Policy, and any other documents incorporated by reference. If you do not agree to the terms of this Agreement, do not use the Bot.

2. Eligibility and Legal Compliance
You affirm that you are of legal age and are legally permitted to enter into this Agreement. You represent and warrant that you are legally authorized to use the Bot in your jurisdiction. You acknowledge that it is your responsibility to ensure that your use of the Bot complies with all laws, regulations, and guidelines in your jurisdiction related to cryptocurrency trading.

3. Assumption of Risk
You acknowledge and agree that cryptocurrency trading involves a high degree of risk and that market conditions, blockchain operations, and other external factors can lead to substantial losses. You assume all financial risks associated with using the Bot, including, but not limited to, losses due to:

Market volatility and price fluctuations of cryptocurrencies;
Technical issues with the blockchain, including forks, disruptions, or operational failures;
Malfunctions, errors, or unavailability of the Bot, including downtime, software bugs, or other technical problems;
Actions or failures of third-party technologies, services, or platforms used by the Bot.
The Company shall not be liable for any losses or damages arising from your use of the Bot, including those resulting from the aforementioned risks.

4. No Guarantees
You understand and agree that the Company makes no representations or guarantees regarding the performance of the Bot or the outcomes of your cryptocurrency transactions. The Bot is provided "as is" and without warranties of any kind, either expressed or implied.

5. Limitation of Liability
To the fullest extent permitted by law, the Company, its affiliates, officers, directors, employees, agents, and licensors will not be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Bot.

6. Indemnification
You agree to indemnify and hold harmless the Company, its affiliates, officers, directors, employees, agents, and licensors from any claim or demand, including reasonable attorneys’ fees, made by any third party due to or arising out of your breach of this Agreement, your use of the Bot, or your violation of any law or the rights of a third party.

7. Modifications to the Agreement
The Company reserves the right to modify this Agreement at any time. You will be notified of any changes and your continued use of the Bot after such notification will constitute your acceptance of the changes.

8. Governing Law
This Agreement shall be governed by and construed in accordance with the laws of [Jurisdiction], without giving effect to any principles of conflicts of law.

9. Dispute Resolution
Any disputes arising under this Agreement or in connection with the Bot shall be resolved through binding arbitration in accordance with the rules of [Arbitration Body] in [Location].

10. Entire Agreement
This Agreement constitutes the entire agreement between you and the Company regarding your use of the Bot and supersedes all prior and contemporaneous written or oral agreements between you and the Company.

By clicking 'Agree' and/or using the Bot, you acknowledge that you have read this Agreement, understand it, and agree to be bound by its terms and conditions.`;