import { PositionDisplayInfo } from "./position_display_info";
import { SessionValue } from "./session";

export interface UserData {
	durableObjectID : string
	initialized : boolean	
	telegramUserID? : number
	telegramUserName?: string
	hasWallet: boolean
	session : Record<string,SessionValue>
	positions : PositionDisplayInfo[]
};