import { DurableObjectState, DurableObjectStorage } from "@cloudflare/workers-types";
import { Env } from "../../env";
import { makeJSONResponse, maybeGetJson } from "../../http";
import { logDebug, logError } from "../../logging";
import { MapWithStorage, assertNever } from "../../util";
import { wakeUp } from "../user/userDO_interop";
import { HeartbeatWakeupRequest } from "./actions/hearbeat_wake_up";
import { RegisterUserDORequest, RegisterUserDOResponse } from "./actions/register_user_do";
import { HeartbeatDOFetchMethod, parseHeartbeatDOFetchMethod } from "./heartbeat_DO_interop";

const HALF_WAKEUP_CRON_JOB_INTERVAL_MS = 15000;

interface UserInfo {
    telegramUserID : number
    chatID : number,
    lastPinged : number
}

export class HeartbeatDO {
    /*
        Maintains a list of tokens to poll for price updates
    */

    state: DurableObjectState;
    env : Env;
    processing: boolean = false;
    //tokenPairPositionTrackerInstances : MapWithStorage<boolean> = new MapWithStorage<boolean>("tokenPairPositionTrackerInstanceIDs");
    userDOsToWakeUp : MapWithStorage<UserInfo> = new MapWithStorage<UserInfo>("userDOsToWakeUp");

    constructor(state : DurableObjectState, env : Env) {
        this.state = state;
        this.env = env;
        this.state.blockConcurrencyWhile(async () => {
            await this.loadStateFromStorage(this.state.storage);
        });
    }

    async loadStateFromStorage(storage : DurableObjectStorage) {
        //logDebug("Loading heartbeatDO from storage");
        const storageEntries = await storage.list();   
        //this.tokenPairPositionTrackerInstances.initialize(storageEntries);
        this.userDOsToWakeUp.initialize(storageEntries);
        //logDebug("Loaded loading heartbeatDO from storage")
    }

    async flushToStorage() {
        await Promise.allSettled([
            //this.tokenPairPositionTrackerInstances.flushToStorage(this.state.storage),
            this.userDOsToWakeUp.flushToStorage(this.state.storage)
        ]);
    }

    async fetch(request : Request, env : Env, context: FetchEvent) : Promise<Response> {
        const response = await this._fetch(request, context);
        await this.flushToStorage();
        return response;
    }

    async _fetch(request : Request, context: FetchEvent) : Promise<Response> {
        const [method,jsonRequestBody] = await this.validateFetchRequest(request);
        logDebug(`[[${method}]] :: heartbeat_do`);
        switch(method) {
            case HeartbeatDOFetchMethod.Wakeup:
                // deliberate fire-and-forget here.
                context.waitUntil(this.handleWakeup(jsonRequestBody));
                return makeJSONResponse<{}>({});
            case HeartbeatDOFetchMethod.RegisterUserDO:
                return await this.handleRegisterUser(jsonRequestBody);
            default:
                assertNever(method);
        }
    }  

    async handleRegisterUser(request : RegisterUserDORequest) : Promise<Response> {
        const userInfo : UserInfo = { telegramUserID: request.telegramUserID, chatID : request.chatID, lastPinged : 0 };
        this.userDOsToWakeUp.set(request.telegramUserID.toString(10), userInfo);
        return makeJSONResponse<RegisterUserDOResponse>({});
    }

    // This method keeps the alarms scheduled for the token pair position trackers.
    // Invoking any method on the tracker causes it to check if it should be scheduling an alarm
    async handleWakeup(request : HeartbeatWakeupRequest) : Promise<void> {
        this.processing = true;
        try {
            const startTimeMS = Date.now();
            const userInfos = [...this.userDOsToWakeUp.values()];
            userInfos.sort(u => u.lastPinged);
            for (const userInfo of userInfos) {
                const response = await wakeUp(userInfo.telegramUserID, userInfo.chatID, this.env);
                const key = userInfo.telegramUserID.toString(10);
                if (!response.keepInWakeUpList) {
                    this.userDOsToWakeUp.delete(key);
                }
                else {
                    userInfo.lastPinged = Date.now();
                    this.userDOsToWakeUp.set(key, userInfo);
                }
                const elapsedMS = Date.now() - startTimeMS;
                if (elapsedMS > HALF_WAKEUP_CRON_JOB_INTERVAL_MS) {
                    break;
                }
            }
        }
        catch(e) {
            logError("Problem with waking up trackers", e);
        }
        finally {
            this.processing = false;
        }
    }

    async validateFetchRequest(request : Request) : Promise<[HeartbeatDOFetchMethod,any]> {
        const jsonBody : any = await maybeGetJson<any>(request);
        const methodName = new URL(request.url).pathname.substring(1);
        const method : HeartbeatDOFetchMethod|null = parseHeartbeatDOFetchMethod(methodName);
        if (method == null) {
            const errorMsg = `Unknown method ${methodName} for HeartbeatDO`;
            logError(errorMsg);
            throw new Error(errorMsg);
        }
        return [method,jsonBody];
    }
}