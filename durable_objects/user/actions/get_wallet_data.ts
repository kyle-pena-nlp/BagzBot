import { Wallet } from "../../../crypto"

export interface GetWalletDataRequest {
    telegramUserID: number
}

export interface GetWalletDataResponse {
    wallet : Wallet
}