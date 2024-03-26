import { DecimalizedAmount } from "../../../decimalized"

export interface UserData {
	initialized : boolean	
	telegramUserID? : number
	hasWallet: boolean,
	address ?: string
	hasInviteBetaCodes : boolean
	maybeSOLBalance : DecimalizedAmount|null
};