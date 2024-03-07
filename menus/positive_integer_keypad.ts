import { CallbackButton, Menu, MenuCapabilities, MenuCode, MenuDisplayMode, MenuSpec } from "./menu";
import { UserData } from "../common";
import { TelegramWebhookInfo } from "../telegram/telegram_webhook_info";
import { CallbackData } from "./callback_data";

export class PositiveIntegerKeypad extends Menu<string> implements MenuCapabilities {
    
    messageFormat : string
    minValue? : number
    maxValue? : number
    thisMenuCode : MenuCode
    submitMenuCode : MenuCode
    cancelMenuCode : MenuCode

    constructor(messageFormat: string,
        thisMenuCode : MenuCode,
        submitMenuCode : MenuCode,
        cancelMenuCode : MenuCode,
        currentValue:string,
        minValue?:number,
        maxValue?:number) {
        super(currentValue);
        this.messageFormat = messageFormat;
        this.thisMenuCode = thisMenuCode;
        this.submitMenuCode = submitMenuCode;   
        this.cancelMenuCode = cancelMenuCode;
        this.minValue = minValue;
        this.maxValue  = maxValue;
    }

    renderText(): string {
        const values : Record<string,string> = {
            currentValue: this.miscData!!
        };
        return this.messageFormat.replace(/\$\{(\w+)\}/g, (placeholder, key) => 
        { 
            return values[key] || '[Enter A Number]'; 
        });
    }
    
    renderOptions(): CallbackButton[][] {

        /*
            7  8  9
            4  5  6
            1  2  3
            0     x 
            Submit

        */

        const options = this.emptyMenu();
        
        this.maybeInsertKeypadButton(options, "7", 1);
        this.maybeInsertKeypadButton(options, "8",  1);
        this.maybeInsertKeypadButton(options, "9",  1);

        this.maybeInsertKeypadButton(options, "4",  2);
        this.maybeInsertKeypadButton(options, "5",  2);
        this.maybeInsertKeypadButton(options, "6",  2);

        this.maybeInsertKeypadButton(options, "1",  3);
        this.maybeInsertKeypadButton(options, "2",  3);
        this.maybeInsertKeypadButton(options, "3",  3); 
        
        this.maybeInsertKeypadButton(options, "0",  4);

        const backspaceCallbackData = new CallbackData(this.thisMenuCode, (this.miscData||'').slice(0,-1));
        if (this.miscData||'') {
            this.insertButton(options, "x", backspaceCallbackData,  4);
        }

        if (this.isValidSubmission(this.miscData||'')) {
            const submitCallbackData = new CallbackData(this.submitMenuCode, this.miscData||'');
            this.insertButton(options, "Submit", submitCallbackData, 5);
        }
        
        this.insertButtonNextLine(options, "Cancel", new CallbackData(this.cancelMenuCode));

        return options;
    }

    parseMode() : 'MarkdownV2'|'HTML' {
        return 'HTML';
    }

    forceResponse() {
        return true;
    }
    
    renderMenuSpec(mode: MenuDisplayMode): MenuSpec {
        const menuSpec : MenuSpec = {
            text : this.renderText(),
            options : this.renderOptions(),
            parseMode : this.parseMode(),
            mode : mode,
            forceReply : true            
        };
        return menuSpec;
    }

    private maybeInsertKeypadButton(options : CallbackButton[][], character : string, lineNumber : number) {
        const newEntry = this.miscData + character;
        const parses = this.doesItParse(newEntry);
        if (parses) {
            const callbackData = new CallbackData(this.thisMenuCode, newEntry);
            this.insertButton(options, character, callbackData, lineNumber);
        }
    }

    private doesItParse(newEntry : string) {
        return (/^\d+$/).test(newEntry);
    }

    private isValidSubmission(entry : string) {
        const parses = this.doesItParse(entry);
        if (!parses) {
            return false;
        }
        const parsed = parseInt(entry,10);
        if (parsed <= 0) {
            return false;
        }
        if (this.minValue !== undefined) {
            if (parsed < this.minValue) {
                return false;
            }
        }
        if (this.maxValue !== undefined) {
            if (parsed > this.maxValue) {
                return false;
            }
        }
        return true;
    }
}