const crypto = require('crypto');

const UPDATEABLE_PROPERTIES = ["userID", "menuMessageID", "menu", "menuArg"];

/* Durable Object storing state of user */
export class UserDO {

    constructor(state,env) {
        // persistent state object which reaches eventual consistency
        this.state              = state;

        this.id                 = this.state.id.toString();
        this.userID             = null;
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
            case '/get':
                return this.makeJSONResponse(this.makeUserObject());
            case '/update':
                await this.handleUpdate(updateObject);
                return this.makeSuccessResponse();
            case '/generatewallet':
                if (this.wallet) {
                    return this.makeFailureResponse('User Wallet already exists');
                }
                await this.handleGenerateWallet();
                return this.makeSuccessResponse();
            default:
                throw new Error(method);
        }
    }

    makeUserObject() {
        return {
            id: this.id,
            hasWallet: !!(this.wallet),
            positions: this.positions,
            menu: this.menu,
            menuArg: this.menuArg
        };
    }

    async handleUpdate(updateObject) {
        const promises = [];
        for (const [key,value] of Object.entries(updateObject)) {
            if (!UPDATEABLE_PROPERTIES.includes(key)) {
                continue;
            }
            const promise = this.state.storage.set(key,value);
            promises.push(promise);
            this[key] = value;
        }
        await Promise.all(promises);
    }

    async handleGenerateWallet() {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
        this.wallet = {
            publicKey: publicKey,
            privateKey: privateKey
        };
        await this.state.storage.set("wallet", wallet);
    }

    makeSuccessResponse() {
        return new Response(null, {
            status: 200
        });
    }

    makeFailureResponse(status) {
        return new Response(null, {
            status: status || 400,
            statusText: message
        })
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