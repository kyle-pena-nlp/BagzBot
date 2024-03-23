import { DecimalizedAmount } from "../../../decimalized"

export interface UserData {
	initialized : boolean	
	telegramUserID? : number
	telegramUserName?: string
	hasWallet: boolean,
	address ?: string
	hasInviteBetaCodes : boolean
	maybeSOLBalance : DecimalizedAmount|undefined
};