import { DurableObjectState, DurableObjectStorage } from "@cloudflare/workers-types";
import { Env } from "../../env";
import { assertNever, makeJSONResponse, maybeGetJson } from "../../util";
import { ResponseOf } from "../../util/builder_types";
import { BetaInviteCodesMethod, ClaimInviteCodeRequest, ClaimInviteCodeResponse, HasUserClaimedBetaInviteCodeRequest, HasUserClaimedBetaInviteCodeResponse, ListUnclaimedBetaCodesRequest as ListUnsentBetaCodesRequest, ListUnclaimedBetaCodesResponse as ListUnsentBetaCodesResponse, MarkBetaInviteCodeAsSentRequest, MarkBetaInviteCodeAsSentResponse, parseBetaInviteCodeMethod } from "./beta_invite_code_interop";
import { BetaInviteCode } from "./model/beta_invite_code";
import { BetaInviteCodesTracker } from "./trackers/beta_invite_code_tracker";

const MAX_BETA_INVITE_CODE_CHAIN_DEPTH = 3;
const INVITE_CODES_PER_USER = 5;

export class BetaInviteCodesDO {
    /*
        Maintains a list of tokens to poll for price updates
    */

    state: DurableObjectState;
    env : Env;
    betaInviteCodesTracker : BetaInviteCodesTracker = new BetaInviteCodesTracker();

    constructor(state : DurableObjectState, env : Env) {
        this.state = state;
        this.env = env;
        this.state.blockConcurrencyWhile(async () => {
            await this.loadStateFromStorage(this.state.storage);
        });
    }

    async loadStateFromStorage(storage : DurableObjectStorage) {
        const storageEntries = await storage.list();
        this.betaInviteCodesTracker.initialize(storageEntries);     
    }

    async flushToStorage() {
        await Promise.allSettled([
            this.betaInviteCodesTracker.flushToStorage(this.state.storage)
        ]);
    }

    async fetch(request : Request) : Promise<Response> {
        const responseBody = await this._fetch(request);
        const response = makeJSONResponse(responseBody);
        await this.flushToStorage();
        return response;
    }

    async _fetch(request : Request) : Promise<any> {
        const [method,jsonRequestBody] = await this.validateFetchRequest(request);
        switch(method) {
            case BetaInviteCodesMethod.Claim:
                return await this.handleClaimBetaInviteCode(jsonRequestBody);
            case BetaInviteCodesMethod.ListUnsentCodes:
                return await this.handleListUnsentCodes(jsonRequestBody);
            case BetaInviteCodesMethod.MarkAsSent:
                return await this.handleMarkAsSent(jsonRequestBody);
            case BetaInviteCodesMethod.HasUserClaimedBetaInviteCode:
                return await this.handleHasUserClaimedBetaInviteCode(jsonRequestBody);
            default:
                assertNever(method);
        }
    }

    private async handleHasUserClaimedBetaInviteCode(request : HasUserClaimedBetaInviteCodeRequest) : Promise<HasUserClaimedBetaInviteCodeResponse> {
        const code = this.betaInviteCodesTracker.getByClaimer(request.userID);
        if (code != null) {
            return { status: 'has' };
        }
        else {
            return { status: 'has-not' };
        }
    }

    private async handleMarkAsSent(request : MarkBetaInviteCodeAsSentRequest) : Promise<ResponseOf<MarkBetaInviteCodeAsSentResponse>> {
        const betaInviteCode = this.betaInviteCodesTracker.get(request.betaInviteCode);
        if (betaInviteCode == null) {
            return { success: false, message: 'betaInviteCode DNE' };
        }
        betaInviteCode.sent = true;
        this.betaInviteCodesTracker.set(betaInviteCode.code,betaInviteCode);
        return { success: true, data: {} };
    }

    private async handleListUnsentCodes(request : ListUnsentBetaCodesRequest) : Promise<ResponseOf<ListUnsentBetaCodesResponse>> {
        const me = request.userID;
        // get all codes issued by me
        let inviteCodes : BetaInviteCode[] = this.betaInviteCodesTracker.listByIssuer(me);
        // if there are less codes than allowed, generate new ones
        if (inviteCodes.length < INVITE_CODES_PER_USER) {
            const myInviteCode = this.betaInviteCodesTracker.getByClaimer(me);
            const depth = (myInviteCode != null) ? myInviteCode.depth + 1 : 1;
            if (depth > MAX_BETA_INVITE_CODE_CHAIN_DEPTH) {
                return { success: true, data : { betaInviteCodes: [] } }
            }
            const newCodes = this.betaInviteCodesTracker.generateAndStoreBetaInviteCodes(me, INVITE_CODES_PER_USER - inviteCodes.length, depth);
            inviteCodes = [...inviteCodes, ...newCodes];
        }
        // filter to unclaimed, unsent
        const unsentCodes = inviteCodes.filter(c => !c.claimed && !c.sent).map(c => c.code);
        return { success: true, data : { betaInviteCodes: unsentCodes } };
    }

    private async handleClaimBetaInviteCode(request : ClaimInviteCodeRequest) : Promise<ClaimInviteCodeResponse> {
        const userID = request.userID;
        const code = request.inviteCode;
        const inviteCode = this.betaInviteCodesTracker.get(code);
        if (inviteCode == null) {
            return {
                status: 'code-does-not-exist'
            };
        }
        if (inviteCode.claimer != null) {
            if (inviteCode.claimer === userID) {
                return {
                    status: 'already-claimed-by-you'
                };
            }
            else {
                return {
                    status: 'claimed-by-someone-else'
                };
            }
        }
        else if (inviteCode.claimer == null) {
            inviteCode.claimer = request.userID;
            this.betaInviteCodesTracker.set(code, inviteCode);
            return {
                status: 'firsttime-claimed-by-you'
            };
        }
        assertNever(inviteCode.claimer);
    }
    
    async validateFetchRequest(request : Request) : Promise<[BetaInviteCodesMethod,any]> {
        const jsonBody : any = await maybeGetJson<any>(request);
        const methodName = new URL(request.url).pathname.substring(1);
        const method : BetaInviteCodesMethod|null = parseBetaInviteCodeMethod(methodName);
        if (method == null) {
            throw new Error(`Unknown method ${method}`);
        }
        return [method,jsonBody];
    }    
}