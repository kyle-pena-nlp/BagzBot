import { Env } from "../../env";
import { makeJSONRequest } from "../../http";
import { HeartbeatWakeupRequest, HeartbeatWakeupResponse } from "./actions/hearbeat_wake_up";
import { RegisterUserDORequest, RegisterUserDOResponse } from "./actions/register_user_do";

export enum HeartbeatDOFetchMethod {
    Wakeup = "Wakeup",
    RegisterUserDO = "RegisterUserDO"
}

export async function registerUser(telegramUserID : number, chatID : number, env : Env) : Promise<RegisterUserDOResponse> {
    const request : RegisterUserDORequest = { telegramUserID, chatID };
    const method = HeartbeatDOFetchMethod.RegisterUserDO;
    const response = sendJSONRequestToHeartbeatDO<RegisterUserDORequest,RegisterUserDOResponse>(method,request,env);
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

async function sendJSONRequestToHeartbeatDO<TRequest,TResponse>(method : HeartbeatDOFetchMethod, request : TRequest, env : Env) : Promise<TResponse> {
    const durableObjectID = env.HeartbeatDO.idFromName('singleton');
    const stub = env.HeartbeatDO.get(durableObjectID);
    const jsonRequest = makeJSONRequest(`http://hearbeatDO.blah/${method.toString()}`, request);
    const response = await stub.fetch(jsonRequest);
    const responseBody = await response.json();
    return responseBody as TResponse;
}