import { DurableObjectState } from "@cloudflare/workers-types";
import { PolledTokenPairListDOFetchMethod, ValidateTokenRequest, ValidateTokenResponse, parsePolledTokenPairListDOFetchMethod } from "./polled_token_pair_list_DO_interop";
import { makeFailureResponse, makeJSONResponse, makeSuccessResponse, maybeGetJson } from "./http_helpers";
import { Env } from "./common";
import { TokenInfo, TokenTracker } from "./token_tracker";
import { PolledTokenPairTracker } from "./polled_token_pair_tracker";

type TokensByVsToken = Map<string,string[]>;
interface PriceAPIRequestSpec {
    vsToken : string
    url : string
    tokens : string[]
};

export class PolledTokenPairListDO {
    /*
        Maintains a list of tokens to poll for price updates
    */

    state: DurableObjectState
    env : Env
    polledTokenPairTracker : PolledTokenPairTracker
    tokenTracker : TokenTracker

    constructor(state : DurableObjectState, env : Env) {
        this.state = state;
        this.env = env;
        this.polledTokenPairTracker = new PolledTokenPairTracker();
        this.tokenTracker = new TokenTracker();
        this.state.blockConcurrencyWhile(async () => {
            await this.initializeFromStorage(this.state.storage);
        })
    }

    async initializeFromStorage(storage : DurableObjectStorage) {
        const storageEntries = await storage.list();
        this.polledTokenPairTracker.initialize(storageEntries);
        this.tokenTracker.initialize(storageEntries);        
    }

    async fetch(request : Request) : Promise<Response> {
        const [method,jsonRequestBody] = await this.validateRequest(request);
        switch(method) {
            case PolledTokenPairListDOFetchMethod.initialize:
                return makeSuccessResponse();
            case PolledTokenPairListDOFetchMethod.validateToken:
                const validateTokenResponse = await this.handleValidateToken(jsonRequestBody);
                return makeJSONResponse(validateTokenResponse);
            default:
                return makeFailureResponse("Unknown method.");
        }
    }

    async handleValidateToken(request: ValidateTokenRequest) : Promise<ValidateTokenResponse> {
        
        const tokenAddress = request.tokenAddress;

        // crude check to filter out obviously not token addresses entered by the user
        if (!this.looksLikeATokenAddress(tokenAddress)) {
            return {
                type: 'invalid'
            };
        }

        // TODO: retry of existence check under certain circumstances (which circumstances?)
        // if the token is already known to not exist, return invalid
        if (this.tokenTracker.isNonExistent(tokenAddress)) {
            return {
                type: 'invalid'
            }
        }

        // if the token is already in the tracker, respond with the token info
        const tokenInfo = this.tokenTracker.get(tokenAddress);
        if (tokenInfo) {
            return {
                type : 'valid',
                token: tokenInfo.token,
                tokenAddress: tokenInfo.tokenAddress,
                logoURI : tokenInfo.logoURI,
                decimals : tokenInfo.decimals
            };
        }

        // If the token isn't in the tracker, re-fetch all tokens list from jupiter.  
        const allTokens = await this.getAllTokensFromJupiter();

        // If it's in the list of returned tokens, add it to the token tracker and respond that the token is validated
        if (tokenAddress in allTokens) {
            const tokenInfo = allTokens[tokenAddress];
            this.tokenTracker.addToken(tokenInfo);
            this.tokenTracker.flushToStorage(this.state.storage); // fire and forget
            return {
                type : 'valid',
                token: tokenInfo.token,
                tokenAddress: tokenInfo.tokenAddress,
                logoURI : tokenInfo.logoURI
            };
        }
        // otherwise, note it doesn't exist. (TODO: periodically flush non-existence list)
        else {
            this.tokenTracker.markAsNonExistent(tokenAddress);
            return {
                type: 'invalid'
            }
        }
    }

    
    looksLikeATokenAddress(tokenAddress : string) : boolean {
        const length = tokenAddress.length;
        if (length < 32 || length > 44) {
            return false;
        }
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(tokenAddress);
    }

    // implement rate-limiting and return null if rate limited
    async getAllTokensFromJupiter() : Promise<Record<string,TokenInfo>> {
        const url = "https://token.jup.ag/all";
        const response = await fetch(url);
        const allTokensJSON = await response.json() as any[];
        const tokenInfos : Record<string,TokenInfo> = {};
        for (const tokenJSON of allTokensJSON) {
            const tokenInfo : TokenInfo = { 
                tokenAddress: tokenJSON.address as string,
                token: tokenJSON.name as string,
                logoURI: tokenJSON.logoURI as string,
                decimals: tokenJSON.decimals as number
            };
            tokenInfos[tokenInfo.tokenAddress] = tokenInfo;
        }
        return tokenInfos;   
    }

    async validateRequest(request : Request) {
        const jsonBody : any = await maybeGetJson<any>(request);
        const methodName = new URL(request.url).pathname.substring(1);
        const method : PolledTokenPairListDOFetchMethod|null = parsePolledTokenPairListDOFetchMethod(methodName);
        if (method == null) {
            throw new Error(`Unknown method ${method}`);
        }
        return [method,jsonBody];
    }

    doScheduledUpdate(env : any) {
        const tokensByVsToken = this.groupTokensByVsToken();
        const priceAPIUrls = this.toPriceAPIRequests(tokensByVsToken);
        // TODO: investigate rate limiting, etc. since these are parallel requests.
        priceAPIUrls.forEach(priceApiRequestSpec => {
            fetch(priceApiRequestSpec.url).then(response => {
                this.processPriceAPIResponse(response, env, priceApiRequestSpec);
            }).catch(error => {
                this.processPriceAPIResponseFailure(error, env, priceApiRequestSpec);
            });
        });
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
        let id = env.PositionTrackerDO.idFromName(name);
        let stub = env.TOKEN_TICKER_DO.get(id);
        return stub;
    }

    processPriceAPIResponseFailure(env : any, token : string, priceApiRequestSpec : PriceAPIRequestSpec) {
        // TODO: logging, etc.
    }

    groupTokensByVsToken() : TokensByVsToken {
        const tokensByVsToken = new Map();
        for (const [token,vsToken] of this.polledTokenPairTracker.list()) {
            if (!tokensByVsToken.has(vsToken)) {
                tokensByVsToken.set(vsToken, []);
            }
            const batch = tokensByVsToken.get(vsToken);
            batch.push(token);
        }
        return tokensByVsToken;
    }

    toPriceAPIRequests(tokensByVsToken : Map<string,string[]>) {
        const baseUrl = this.env.JUPITER_PRICE_API_URL;        
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