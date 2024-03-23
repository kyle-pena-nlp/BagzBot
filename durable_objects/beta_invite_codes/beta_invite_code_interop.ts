import { Env } from "../../env";
import { makeJSONRequest, tryParseInt } from "../../util";
import { ResponseOf, WithMethod, WithUserID } from "../../util/builder_types";

export enum BetaInviteCodesMethod {
    Claim = "Claim",
    ListUnclaimedCodes = "ListUnclaimedCodes",
    MarkAsSent = "MarkAsSent",
    HasUserClaimedBetaInviteCode = "HasUserClaimedBetaInviteCode"
}

export function parseBetaInviteCodeMethod(value : string) : BetaInviteCodesMethod|null {
	return Object.values(BetaInviteCodesMethod).find(x => x === value)||null;
}

export type ClaimInviteCodeRequest = WithUserID<{inviteCode: string}>
export type ClaimInviteCodeResponse = { status : 'firsttime-claimed-by-you'|'you-already-claimed-different-code'|'already-claimed-by-you'|'claimed-by-someone-else'|'code-does-not-exist' }

export async function claimInviteCode(request : WithUserID<{ inviteCode : string }>, env : Env) : Promise<ClaimInviteCodeResponse> {
    const r = { method : BetaInviteCodesMethod.Claim, data : request };
    const response = await sendJSONRequestToDO<ClaimInviteCodeRequest,ClaimInviteCodeResponse>(r, env);
    return response;
}

export type ListUnclaimedBetaCodesRequest = WithUserID<{}>;
export type ListUnclaimedBetaCodesResponse = { betaInviteCodes : string[] };

export async function listUnclaimedBetaInviteCodes(request : ListUnclaimedBetaCodesRequest, env : Env) : Promise<ResponseOf<ListUnclaimedBetaCodesResponse>> {
    const r = { method : BetaInviteCodesMethod.ListUnclaimedCodes, data : request };
    const response = await sendJSONRequestToDO<ListUnclaimedBetaCodesRequest,ResponseOf<ListUnclaimedBetaCodesResponse>>(r, env);
    return response;
}

export type HasUserClaimedBetaInviteCodeRequest = WithUserID<{}>;
export type HasUserClaimedBetaInviteCodeResponse = { status : 'has'|'has-not' }

export async function getUserHasClaimedBetaInviteCode(request : HasUserClaimedBetaInviteCodeRequest, env : Env) : Promise<HasUserClaimedBetaInviteCodeResponse> {
    const userID = request.userID;
    const exceptions = env.BETA_CODE_GATE_EXCEPTIONS.split(",").map(id => tryParseInt(id)).filter(id => id != null);
    if (exceptions.includes(userID)) {
        return { status: 'has' };
    }
    const r = { method: BetaInviteCodesMethod.HasUserClaimedBetaInviteCode, data : request };
    const response = await sendJSONRequestToDO<HasUserClaimedBetaInviteCodeRequest,HasUserClaimedBetaInviteCodeResponse>(r, env);
    return response;
}

export type MarkBetaInviteCodeAsSentRequest = { betaInviteCode : string }
export type MarkBetaInviteCodeAsSentResponse = { }

async function sendJSONRequestToDO<TRequest,TResponseData>(r : WithMethod<TRequest,BetaInviteCodesMethod>, env : Env) : Promise<TResponseData> {
    const url = `http://betaInviteCodes.blah/${r.method.toString()}`;
    const request = makeJSONRequest(url, r.data);
	const namespace = env.BetaInviteCodesDO as DurableObjectNamespace;
	const id = namespace.idFromName('singleton');
	const durableObject = namespace.get(id);
    const response = (await durableObject.fetch(request)) as Response;
    const responseBody = await response.json();
    return responseBody as TResponseData;
}