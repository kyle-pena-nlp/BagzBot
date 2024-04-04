import { logError } from "../logging";

export async function maybeGetJson<T>(x : Request|Response) : Promise<T|null> {
    try {
        return await x.json();
    }
    catch {
        return null;
    }
}

export async function tryReadResponseBody(x : Response) : Promise<any|null> {
    try {
        return await x.json();
    }
    catch {
        return null;
    }
}

export async function fetchAndReadResponse(request : Request) : Promise<null|{ body: any, ok : boolean }> {
    const response = await fetch(request)
        .then(async tgResponse => {
            const responseBody = (await tgResponse.json().catch(e => {})) as any;
            let ok = tgResponse.ok;
            if (!ok && (responseBody.description||'').includes("is not modified")) {
                // TG has an annoying edge case where it considers an update with the same text to be an invalid request.
                // I am overriding that determination by TG here.
                ok = true;
            }
            else if (!ok) {
                logError(responseBody.description||'');
            }
            return { body: responseBody, ok: ok };
        })
        .catch(e => {
            logError(`Error sending request`, e);
            return null;
        });
    return response;
}


export function makeJSONRequest<T>(url : string, body : T) : Request {
    const json = JSON.stringify(body);
    const request = new Request(url, {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        },
        body: json
    });
    return request;
}

export function makeRequest(url : string, method? : 'GET'|'POST') {
    return new Request(url, {
        method: method
    });    
}

export function makeJSONResponse<T>(body: T, status? : number, statusText? : string) : Response {
    return new Response(JSON.stringify(body), {
        status: status || 200,
        statusText: statusText || "",
        headers: {
            'Content-Type': 'application/json'
        }
    });
}

export function makeSuccessResponse(description? : string) : Response {
    return new Response(null, {
        status: 200,
        statusText: description||''
    });
}

export function makeFailureResponse(message : string, status? : number) : Response {
    return new Response(null, {
        status: status || 400,
        statusText: message
    });
}

/* A non-200 response for TG will cause it to retry sending the webhook.  So we send a 'fake' failure back to TG instead */
export function makeFakeFailedRequestResponse(status : number, statusText? : string, description? : string) : Response {
    const response = new Response(null, {
        status: 200, // see comment on retries
        statusText: status.toString() + ":" + (statusText||"") + ":" + (description||"")
    });
    return response;
}
