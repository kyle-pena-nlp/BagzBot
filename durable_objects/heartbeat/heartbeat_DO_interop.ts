import { Env } from "../../env";
import { logError } from "../../logging";
import { makeJSONRequest } from "../../util";
import { AdminCountPositionsRequest, AdminCountPositionsResponse } from "./actions/admin_count_positions";
import { HeartbeatWakeupRequest, HeartbeatWakeupResponse } from "./actions/hearbeat_wake_up";
import { RegisterTokenPairRequest, RegisterTokenPairResponse } from "./actions/register_token_pair";

export enum HeartbeatDOFetchMethod {
    Wakeup = "Wakeup",
    RegisterTokenPair = "RegisterTokenPair",
    adminCountPositions = "adminCountPositions"
}

// TODO: move this to heartbeat DO.
export async function adminCountAllPositions(env : Env) : Promise<AdminCountPositionsResponse> {
	const request : AdminCountPositionsRequest = {};
	const method = HeartbeatDOFetchMethod.adminCountPositions;
	const response = await sendJSONRequestToHeartbeatDO<AdminCountPositionsRequest,AdminCountPositionsResponse>(method,request,env);
    return response;
}

export function parseHeartbeatDOFetchMethod(value : string) : HeartbeatDOFetchMethod|null {
	return Object.values(HeartbeatDOFetchMethod).find(x => x === value)||null;
}

export async function doHeartbeatWakeup(env : Env) {
    const method = HeartbeatDOFetchMethod.Wakeup;
    const request : HeartbeatWakeupRequest = {};
    await sendJSONRequestToHeartbeatDO<HeartbeatWakeupRequest,HeartbeatWakeupResponse>(method, request, env);
}

export async function ensureTokenPairIsRegistered(tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<void> {
    const method = HeartbeatDOFetchMethod.RegisterTokenPair;
    const request : RegisterTokenPairRequest = { tokenAddress, vsTokenAddress };
    await sendJSONRequestToHeartbeatDO<RegisterTokenPairRequest,RegisterTokenPairResponse>(method,request,env);
}

async function sendJSONRequestToHeartbeatDO<TRequest,TResponse>(method : HeartbeatDOFetchMethod, request : TRequest, env : Env) : Promise<TResponse> {
    const durableObjectID = env.HeartbeatDO.idFromName('singleton');
    const stub = env.HeartbeatDO.get(durableObjectID);
    const jsonRequest = makeJSONRequest(`http://hearbeatDO.blah/${method.toString()}`, request);
    const response = await stub.fetch(jsonRequest);
    const responseBody = await response.json();
    return responseBody as TResponse;
}