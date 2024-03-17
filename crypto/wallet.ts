import { Structural } from "../util";
import { EncryptedPrivateKey } from "./private_keys";

export interface Wallet {
	readonly [ key : string ] : Structural
	telegramUserID : number
	publicKey : string
	encryptedPrivateKey : EncryptedPrivateKey
}

export function toUserAddress(wallet : Wallet) {
	return {
		address : wallet.publicKey
	};
}

export interface UserAddress {
	address : string
}
