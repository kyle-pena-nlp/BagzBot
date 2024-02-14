export class PolledTokenListDO {

    constructor(state, env) {
        this.state = state;
        this.polledTokenPairList = [];
        this.durableObjectStubs  = [];
        this.jupiter_price_api_url = env.JUPITER_PRICE_API_URL;
    }

    async fetch(request) {
        return new Response("Hello World");
    }

    doScheduledUpdate() {
        const tokensByVsToken = this.groupTokensByVsToken();
        const priceAPIUrls = this.toPriceAPIRequests(tokensByVsToken);
        // TODO: investigate rate limiting, etc. since these are parallel requests.
        priceAPIUrls.forEach(([batch,vsToken,url]) => {
            fetch(url).then(response => {
                this.processPriceAPIResponse(env,batch,vsToken,response);
            }).catch(error => {
                this.processPriceAPIResponseFailure(batch,vsToken,error);
            });
        });
    }

    processPriceAPIResponse(env,batch,vsToken,response) {
        if (!response.ok) {            
            // TODO: logging, handling
            return;
        }
        const prices = response.json().data;
        for (const token of batch) {
            if (!prices[token]) {
                // TODO: logging, handling
                continue;
            }
            const price = prices[token].price;
            const stub = this.getDurableObjectForTokenPair(env,token,vsToken);
            const request = new Request('updatePrice', {
                method: 'POST',
                body: {
                    price: price
                }
            });
            stub.fetch(request);
        }
    }

    getDurableObjectForTokenPair(env,token,vsToken) {
        const name = `${token}-->${vsToken}`;
        let id = OBJECT_NAMESPACE.idFromName(name);
        let stub = env.TOKEN_TICKER_DO.get(id);
        return stub;
    }

    processPriceAPIResponseFailure(token,vsToken) {
        // TODO: logging, etc.
    }

    groupTokensByVsToken() {
        const tokensByVsToken = new Map();
        const batches = [];
        for (const [token,vsToken] of this.polledTokenPairList) {
            if (!tokensByVsToken.has(vsToken)) {
                tokensByVsToken.set(vsToken, []);
            }
            const batch = tokensByVsToken.get(vsToken);
            batch.push(token);
        }
        return batches;
    }

    toPriceAPIRequests(tokensByVsToken) {
        const baseUrl = this.jupiter_price_api_url;        
        const priceAPIUrls = [];
        for (const [vsToken,tokens] of tokensByVsToken) {
            const tokenBatches = this.divideIntoBatches(tokens, 99); // jupiter API accepts up to 100 at a time - 99 just to be safe.
            for (const batch of tokenBatches) {
                const ids = batch.forEach(element => { return element[0] }).join(',');
                const url = `${baseUrl}?ids=${ids}&vsToken=${vsToken}`;
                priceAPIUrls.push([batch,vsToken,url]);
            }
        }
        return priceAPIUrls;
    }
}