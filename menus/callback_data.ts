import { MenuCode } from "./menu_code";

export class CallbackData {
	menuCode : MenuCode;
	menuArg? : string;
	constructor(menuCode : MenuCode, menuArg ?: string) {
		this.menuCode = menuCode;
		this.menuArg = menuArg;		
	}
	static parse(callbackDataString : string) : CallbackData {
		const tokens = callbackDataString.split(":").filter(x => !!x);
        if (tokens.length == 1) {
            return new CallbackData(CallbackData.parseMenuCode(tokens[0]), undefined);
        }
        else {
			// TODO: bug here ???, 2nd arg should be: tokens.slice(1).join(":")
            return new CallbackData(CallbackData.parseMenuCode(tokens[0]), tokens[1]);
        }
	}
	toString() : string {
		return [this.menuCode, this.menuArg||''].join(":");
	}
	private static parseMenuCode(menuCode : string) : MenuCode {
		return Object.values(MenuCode).find((x) => x === menuCode)!!;
	}
}