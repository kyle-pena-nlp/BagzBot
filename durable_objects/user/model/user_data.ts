import { Structural } from "../../../util";

export interface UserData {
	initialized : boolean	
	telegramUserID? : number
	telegramUserName?: string
	hasWallet: boolean
	session : Record<string,Structural>
};