export function makeJSONRequest<T>(url : string, body : T, method? : 'GET'|'POST') : Request {
    const json = JSON.stringify(body);
    const request = new Request(url, {
        method: method,
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
    })    
};

export function makeJSONResponse<T>(body: T, status? : number, statusText? : string) : Response {
    return new Response(JSON.stringify(body), {
        status: status || 200,
        statusText: statusText || "",
        headers: {
            'Content-Type': 'application/json'
        }
    });
}

export function makeSuccessResponse() : Response {
    return new Response(null, {
        status: 200
    });
}

export function makeFailureResponse(message : string, status? : number) : Response {
    return new Response(null, {
        status: status || 400,
        statusText: message
    });
}

