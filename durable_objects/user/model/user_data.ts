import { PositionDisplayInfo } from "./position_display_info";
import { SessionValue } from "./session";

export interface UserData {
	initialized : boolean	
	telegramUserID? : number
	telegramUserName?: string
	hasWallet: boolean
	session : Record<string,SessionValue>
};