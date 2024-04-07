import { DurableObjectState } from "@cloudflare/workers-types";
import { Env, getPriceAPIURL } from "../../env";
import { logDebug } from "../../logging";
import { PositionStatus } from "../../positions";
import { SOL_ADDRESS, StagedTokenInfo, TokenInfo } from "../../tokens";
import { assertNever, makeJSONResponse, makeSuccessResponse, maybeGetJson } from "../../util";
import { getPositionCountsFromTracker } from "../token_pair_position_tracker/token_pair_position_tracker_do_interop";
import { AdminCountPositionsRequest, AdminCountPositionsResponse } from "./actions/admin_count_positions";
import { GetTokenInfoRequest, GetTokenInfoResponse } from "./actions/get_token_info";
import { PolledTokenPairListDOFetchMethod, parsePolledTokenPairListDOFetchMethod } from "./polled_token_pair_list_DO_interop";
import { TokenTracker } from "./trackers/token_tracker";

type TokensByVsToken = Map<string,string[]>;
interface PriceAPIRequestSpec {
    vsToken : string
    url : string
    tokens : string[]
};

export class PolledTokenPairListDO {
    /*
        Maintains a list of tokens
    */
    state: DurableObjectState;
    env : Env;
    tokenTracker : TokenTracker;

    constructor(state : DurableObjectState, env : Env) {
        this.state = state;
        this.env = env;
        this.tokenTracker = new TokenTracker();
        this.state.blockConcurrencyWhile(async () => {
            await this.loadStateFromStorage(this.state.storage);
        });
    }

    async loadStateFromStorage(storage : DurableObjectStorage) {
        logDebug("Loading polled_token_pair_list from storage");
        const storageEntries = await storage.list();
        this.tokenTracker.initialize(storageEntries);        
        logDebug("Loaded loading polled_token_pair_list from storage");
    }

    async flushToStorage() {
        await Promise.allSettled([
            this.tokenTracker.flushToStorage(this.state.storage)
        ]);
    }

    async fetch(request : Request) : Promise<Response> {
        const response = await this._fetch(request);
        await this.flushToStorage();
        return response;
    }

    async _fetch(request : Request) : Promise<Response> {
        const [method,jsonRequestBody] = await this.validateFetchRequest(request);
        switch(method) {
            case PolledTokenPairListDOFetchMethod.initialize:
                return makeSuccessResponse();
            case PolledTokenPairListDOFetchMethod.getTokenInfo:
                const validateTokenResponse = await this.handleValidateToken(jsonRequestBody);
                return makeJSONResponse(validateTokenResponse);
            case PolledTokenPairListDOFetchMethod.adminCountPositions:
                throw new Error("");
                // this method spun up a DO for every single jupiter token. oops.
                //return await this.handleAdminCountPositions(jsonRequestBody);
            default:
                assertNever(method);
        }
    }

    async handleAdminCountPositions(request: AdminCountPositionsRequest) : Promise<Response> {
        const vsTokenAddress = SOL_ADDRESS;
        const positionCounts : Record<string,Record<PositionStatus,number>> = {};
        const countsByUser : Record<number,number> = {};
        const addresses = Object.keys(this.tokenTracker.tokenInfos);
        for (const tokenAddress of addresses) {
            const positionCount = await getPositionCountsFromTracker(tokenAddress, vsTokenAddress, this.env);
            positionCounts[tokenAddress] = positionCount;
        }
        return makeJSONResponse<AdminCountPositionsResponse>({ positionCounts });
    }

    async handleValidateToken(request: GetTokenInfoRequest) : Promise<GetTokenInfoResponse> {
        
        const tokenAddress = request.tokenAddress;

        // crude check to filter out obviously not token addresses entered by the user
        if (!this.looksLikeATokenAddress(tokenAddress)) {
            return {
                type: 'invalid',
                tokenInfo: null,
                isForbiddenToken: false
            };
        }

        if (this.isForbiddenToken(tokenAddress)) {
            return {
                type: 'invalid',
                tokenInfo: null,
                isForbiddenToken : true
            }
        }

        // if the token is already in the tracker, respond with the token info
        // if it's not and a counter has expired, fetch a new token list in the background
        // TODO (post-beta): fetch specific tokens instead of all of them.  then have per-token-address cooldowns.
        const tokenInfo = await this.tokenTracker.getTokenInfo(tokenAddress, this.env, this.state.storage);
        if (tokenInfo) {
            return {
                type : 'valid',
                tokenInfo : tokenInfo
            };
        }

        return {
            type: 'invalid',
            tokenInfo: null,
            isForbiddenToken: false
        };
    }

    isForbiddenToken(address : string) {
        return this.env.FORBIDDEN_TOKENS.split(",").includes(address);
    }

    async addFeeAccount(stagedTokenInfo : StagedTokenInfo) : Promise<TokenInfo> {
        // We use the SDK (https://www.npmjs.com/package/@jup-ag/referral-sdk) to ensure the feeAccount is registered w/ the referals program
        const tokenInfo : TokenInfo = {
            ...stagedTokenInfo
        };
        return tokenInfo;
    }
    
    looksLikeATokenAddress(tokenAddress : string) : boolean {
        const length = tokenAddress.length;
        if (length < 32 || length > 44) {
            return false;
        }
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(tokenAddress);
    }

    // implement rate-limiting and return null if rate limited
    async getAllTokensFromJupiter() : Promise<Record<string,StagedTokenInfo>> {
        const url = "https://token.jup.ag/all";
        const response = await fetch(url);
        const allTokensJSON = await response.json() as any[];
        const tokenInfos : Record<string,StagedTokenInfo> = {};
        for (const tokenJSON of allTokensJSON) {
            const tokenInfo : StagedTokenInfo = { 
                address: tokenJSON.address as string,
                name: tokenJSON.name as string,
                symbol: tokenJSON.symbol as string,
                logoURI: tokenJSON.logoURI as string,
                decimals: tokenJSON.decimals as number
            };
            tokenInfos[tokenInfo.address] = tokenInfo;
        }
        return tokenInfos;   
    }

    async validateFetchRequest(request : Request) : Promise<[PolledTokenPairListDOFetchMethod,any]> {
        const jsonBody : any = await maybeGetJson<any>(request);
        const methodName = new URL(request.url).pathname.substring(1);
        const method : PolledTokenPairListDOFetchMethod|null = parsePolledTokenPairListDOFetchMethod(methodName);
        if (method == null) {
            throw new Error(`Unknown method ${method}`);
        }
        return [method,jsonBody];
    }

    async processPriceAPIResponse(response : Response, env: any, priceApiRequestSpec : PriceAPIRequestSpec) {
        if (!response.ok) {            
            // TODO: logging, handling
            return;
        }
        const priceAPIResponse : any = await response.json();
        const prices = priceAPIResponse.data;
        for (const token of priceApiRequestSpec.tokens) {
            if (!prices[token]) {
                // TODO: logging, handling
                continue;
            }
            const price = prices[token].price;
            const stub = this.getDurableObjectForTokenPair(env,token,priceApiRequestSpec.vsToken);
            const request = new Request('updatePrice', {
                method: 'POST',
                body: JSON.stringify({
                    price: price
                })
            });
            stub.fetch(request);
        }
    }

    getDurableObjectForTokenPair(env : any, token : string, vsToken : string) {
        const name = `${token}-->${vsToken}`;
        const id = env.PositionTrackerDO.idFromName(name);
        const stub = env.TOKEN_TICKER_DO.get(id);
        return stub;
    }

    processPriceAPIResponseFailure(env : any, token : string, priceApiRequestSpec : PriceAPIRequestSpec) {
        // TODO: logging, etc.
    }

    toPriceAPIRequests(tokensByVsToken : Map<string,string[]>) {
        const baseUrl = getPriceAPIURL(this.env);        
        const priceAPIUrls : PriceAPIRequestSpec[] = [];
        for (const [vsToken,tokens] of tokensByVsToken) {
            const tokenBatches = this.divideIntoBatches(tokens, 99); // jupiter API accepts up to 100 at a time - 99 just to be safe.
            for (const batch of tokenBatches) {
                const ids = batch.join(',');
                const url = `${baseUrl}?ids=${ids}&vsToken=${vsToken}`;
                priceAPIUrls.push({ 
                    vsToken: vsToken,
                    url: url,
                    tokens: batch
                });
            }
        }
        return priceAPIUrls;
    }

    divideIntoBatches<T>(array : Array<T>, count : number) : Array<Array<T>> {
        const batches : Array<Array<T>> = [];
        let batch : Array<T> = [];
        for (const item of array) {
            batch.push(item);
            if (batch.length >= count) {
                batches.push(batch);
                batch = [];
            }
        }
        return batches;
    }
}