import { Structural } from "../util";

export interface Wallet {
	readonly [ key : string ] : Structural
	publicKey : string
	privateKey : string
}

export function toUserAddress(wallet : Wallet) {
	return {
		address : wallet.publicKey
	}
}

export interface UserAddress {
	address : string
}
