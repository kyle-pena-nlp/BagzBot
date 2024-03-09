import { DecimalizedAmount } from "../../../positions/decimalized_amount"

export interface PriceUpdate {
    token : string
    vsToken : string
    price : DecimalizedAmount
}
