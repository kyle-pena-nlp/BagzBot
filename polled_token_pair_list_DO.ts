import { DurableObjectState } from "@cloudflare/workers-types";

type TokenPair = [string,string];
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
    polledTokenPairList : TokenPair[]
    durableObjectStubs : any[]
    jupiter_price_api_url : string

    constructor(state : DurableObjectState, env : any) {
        this.state = state;
        this.polledTokenPairList = [];
        this.durableObjectStubs  = [];
        this.jupiter_price_api_url = env.JUPITER_PRICE_API_URL;
    }

    async fetch(request : Request) : Promise<Response> {
        return new Response("Hello World");
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
        const batches = [];
        for (const [token,vsToken] of this.polledTokenPairList) {
            if (!tokensByVsToken.has(vsToken)) {
                tokensByVsToken.set(vsToken, []);
            }
            const batch = tokensByVsToken.get(vsToken);
            batch.push(token);
        }
        return tokensByVsToken;
    }

    toPriceAPIRequests(tokensByVsToken : Map<string,string[]>) {
        const baseUrl = this.jupiter_price_api_url;        
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