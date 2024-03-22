import { MapWithStorage } from "../../../util";
import { BetaInviteCode } from "../model/beta_invite_code";

const BETA_INVITE_CODE_CHARACTER_LENGTH = 6;

export class BetaInviteCodesTracker extends MapWithStorage<BetaInviteCode> {
    codeByClaimer : Map<number,BetaInviteCode> = new Map<number,BetaInviteCode>();
    constructor() {
        super("betaInviteCodes");
    }
    getByClaimer(userID : number) : BetaInviteCode|undefined {
        return this.codeByClaimer.get(userID);
    }
    listByIssuer(userID :  number) : BetaInviteCode[] {
        const result : BetaInviteCode[] = [];
        for (const inviteCode of this.items.values()) {
            if (inviteCode.issuerUserID === userID) {
                result.push(inviteCode);
            }
        }
        return result;
    }
    generateAndStoreBetaInviteCodes(issuerUserID : number, howMany : number, depth : number) : BetaInviteCode[] {
        const result : BetaInviteCode[] = [];
        for (let i = 0; i < howMany; i++) {
            const newCode = this.makeRandomCode();
            const betaInviteCode : BetaInviteCode = {
                issuerUserID: issuerUserID,
                code: newCode,
                sent: false,
                claimed: false,
                claimer : null,
                depth: depth                
            };
            this.set(betaInviteCode.code, betaInviteCode);
        }
        return result;
    }
    set(key : string, value : BetaInviteCode) {
        if (value.claimer != null) {
            this.codeByClaimer.set(value.claimer, value);
        }
        super.set(key, value);
    }
    delete(key : string) {
        const value = super.get(key);
        if (value != null && value.claimer != null) {
            this.codeByClaimer.delete(value.claimer);
        }
        return super.delete(key);
    }
    clear() {
        this.codeByClaimer.clear();
        super.clear();
    }
    initialize(entries: Map<string, any>): void {
        super.initialize(entries);
        for (const [key,value] of this.items) {
            if (value.claimer != null) {
                this.codeByClaimer.set(value.claimer, value);
            }
        }
    }
    private makeRandomCode() {
        const existingCodes = new Set<string>([...this.values()].map(c => c.code));
        let code = this.generateRandomString(BETA_INVITE_CODE_CHARACTER_LENGTH); // 32^6 possibilities.
        while(existingCodes.has(code)) {
            code = this.generateRandomString(BETA_INVITE_CODE_CHARACTER_LENGTH);
        }
        return code;
    }
    private generateRandomString(length: number): string {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
}