/* Durable Object storing state of user */
export class UserDO {


    constructor(state,env) {
        // persistent state object which reaches eventual consistency
        this.state              = state;

        this.id                 = null;
        this.wallet             = null;
        this.positions          = [];
        this.history            = [];
        this.menuMessageID      = null;
        this.menu               = null;
        this.menuArg            = null;
    }

    async fetch(request) {

        const method = new URL(request).pathname.toLowerCase();

        switch(method) {
            case '/haswallet':
                return this.makeJSONResponse({ value: !!(this.wallet) });
            case '/positions':
                return this.makeJSONResponse({ positions: this.positions });
            case '/history':
                return this.makeJSONResponse({ history: this.history });
            default:
                throw new Error(method);
        }
    }

    makeJSONResponse(body) {
        const headers = new Headers({
            "Content-Type": "application/json"
        })
        return new Response(body, {
            status: 200,
            headers : headers
        });
    }
}