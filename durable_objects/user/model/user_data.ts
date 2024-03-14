import { PositionDisplayInfo } from "./position_display_info";
import { Structural } from "../../../util/structural";

export interface UserData {
	initialized : boolean	
	telegramUserID? : number
	telegramUserName?: string
	hasWallet: boolean
	session : Record<string,Structural>
};