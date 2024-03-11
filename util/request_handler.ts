// TODO: move to handlers-based arch instead of giant switch statement.
// then, from a code-org perspective, put the handlers with the actions.
export interface IRequestHandler<TMethod,TThis,TRequestBody,TResponseBody> {
    handle(this : TThis, method : TMethod, requestBody : TRequestBody ) : Promise<TResponseBody>;
}