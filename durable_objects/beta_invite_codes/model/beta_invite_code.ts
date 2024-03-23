export interface BetaInviteCode {
    issuerUserID : number
    code : string
    sent : boolean
    claimer : number|null
    depth : number
}