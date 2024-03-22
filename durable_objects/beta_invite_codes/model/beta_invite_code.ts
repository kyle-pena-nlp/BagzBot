export interface BetaInviteCode {
    issuerUserID : number
    code : string
    sent : boolean
    claimed : boolean
    claimer : number|null
    depth : number
}