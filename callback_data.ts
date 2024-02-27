import { MenuCode } from "./menu";

export class CallbackData {
	menuCode : MenuCode
	menuArg? : string
	constructor(menuCode : MenuCode, menuArg ?: string) {
		this.menuCode = menuCode;
		this.menuArg = menuArg;		
	}
	static parse(callbackDataString : string) : CallbackData {
		const tokens = callbackDataString.split(":").filter(x => !!x);
        if (tokens.length == 1) {
            return new CallbackData(MenuCode[tokens[0] as keyof typeof MenuCode], undefined);
        }
        else {
            return new CallbackData(MenuCode[tokens[0] as keyof typeof MenuCode], tokens[1]);
        }
	}
	toString() : string {
		return [this.menuCode, this.menuArg||''].join(":");
	}
};