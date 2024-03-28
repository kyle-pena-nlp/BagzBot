import { Env } from "../../env";
import { makeJSONResponse } from "../../util";
import { HeartbeatWakeupRequest, HeartbeatWakeupResponse } from "./actions/hearbeat_wake_up";
import { RegisterTokenPairRequest, RegisterTokenPairResponse } from "./actions/register_token_pair";

export enum HeartbeatDOFetchMethod {
    Wakeup = "Wakeup",
    RegisterTokenPair = "RegisterTokenPair" 
}

export function parseHeartbeatDOFetchMethod(value : string) : HeartbeatDOFetchMethod|null {
	return Object.values(HeartbeatDOFetchMethod).find(x => x === value)||null;
}

export async function doHeartbeatWakeup(env : Env) {
    const method = HeartbeatDOFetchMethod.Wakeup;
    const request : HeartbeatWakeupRequest = {};
    await sendJSONRequestToHeartbeatDO<HeartbeatWakeupRequest,HeartbeatWakeupResponse>(method, request, env);
}

export async function ensureTokenPairIsRegistered(tokenAddress : string, vsTokenAddress : string, env : Env) {
    const method = HeartbeatDOFetchMethod.RegisterTokenPair;
    const request : RegisterTokenPairRequest = { tokenAddress, vsTokenAddress };
    await sendJSONRequestToHeartbeatDO<RegisterTokenPairRequest,RegisterTokenPairResponse>(method,request,env);
}

async function sendJSONRequestToHeartbeatDO<TRequest,TResponse>(method : HeartbeatDOFetchMethod, request : TRequest, env : Env) : Promise<TResponse> {
    const durableObjectID = env.HeartbeatRequestDO.idFromName('singleton');
    const stub = env.HeartbeatRequestDO.get(durableObjectID);
    const jsonRequest = makeJSONResponse(request);
    const response = stub.fetch(jsonRequest);
    const responseBody = await response.json();
    return responseBody as TResponse;
}