import { DecimalizedAmount } from "../../../decimalized"
import { Structural } from "../../../util"

export interface UserPNL {
	readonly [ key : string ] : Structural
	originalTotalValue: DecimalizedAmount
	currentTotalValue : DecimalizedAmount
	PNL: DecimalizedAmount
	PNLpercent : DecimalizedAmount
}

export interface UserData {
	initialized : boolean	
	telegramUserID? : number
	hasWallet: boolean,
	address ?: string
	hasInviteBetaCodes : boolean
	maybeSOLBalance : DecimalizedAmount|null
	maybePNL : UserPNL|null
};