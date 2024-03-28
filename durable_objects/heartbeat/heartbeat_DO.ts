import { DurableObjectState, DurableObjectStorage } from "@cloudflare/workers-types";
import { Env } from "../../env";
import { logError } from "../../logging";
import { MapWithStorage, assertNever, makeJSONRequest, makeJSONResponse, maybeGetJson } from "../../util";
import { HeartbeatWakeupRequest } from "../token_pair_position_tracker/actions/heartbeat_wake_up";
import { TokenPairKey, TokenPairPositionTrackerDOFetchMethod } from "../token_pair_position_tracker/token_pair_position_tracker_DO_interop";
import { HeartbeatDOFetchMethod, RegisterTokenPairRequest, RegisterTokenPairResponse, parseHeartbeatDOFetchMethod } from "./heartbeat_do_interop";

export class HeartbeatDO {
    /*
        Maintains a list of tokens to poll for price updates
    */

    state: DurableObjectState;
    env : Env;
    processing: boolean = false;
    tokenPairPositionTrackerInstances : MapWithStorage<boolean> = new MapWithStorage<boolean>("tokenPairPositionTrackerInstanceIDs");

    constructor(state : DurableObjectState, env : Env) {
        this.state = state;
        this.env = env;
        this.state.blockConcurrencyWhile(async () => {
            await this.loadStateFromStorage(this.state.storage);
        });
    }

    async loadStateFromStorage(storage : DurableObjectStorage) {
        const storageEntries = await storage.list();   
        this.tokenPairPositionTrackerInstances.initialize(storageEntries);
    }

    async flushToStorage() {
        await Promise.allSettled([
            this.tokenPairPositionTrackerInstances.flushToStorage(this.state.storage)
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
            case HeartbeatDOFetchMethod.Wakeup:
                // deliberate fire-and-forget here.
                this.handleWakeup(jsonRequestBody);
                return {};
            case HeartbeatDOFetchMethod.RegisterTokenPair:
                return await this.handleRegisterToken(jsonRequestBody);
            default:
                assertNever(method);
        }
    }

    async handleRegisterToken(request : RegisterTokenPairRequest) : Promise<RegisterTokenPairResponse> {
        const tokenPairKey = new TokenPairKey(request.tokenAddress, request.vsTokenAddress);
        this.tokenPairPositionTrackerInstances.set(tokenPairKey.toString(), true);
        const response : RegisterTokenPairResponse = {};
        return response;
    }

    async handleWakeup(request : HeartbeatWakeupRequest) : Promise<void> {
        this.processing = true;
        try {
            const namespace = this.env.TokenPairPositionTrackerDO;
            for (const tokenPairID of this.tokenPairPositionTrackerInstances.keys()) {
                const durableObjectID = namespace.idFromName(tokenPairID);
                const stub = namespace.get(durableObjectID);
                const requestBody : HeartbeatWakeupRequest = { isHeartbeat : true };
                const method = TokenPairPositionTrackerDOFetchMethod.wakeUp;
                const jsonRequest = makeJSONRequest(`http://tokenPairPositionTracker/${method.toString()}`, requestBody);
                const response = await stub.fetch(jsonRequest);
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
            throw new Error(`Unknown method ${method}`);
        }
        return [method,jsonBody];
    }  

}