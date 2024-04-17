export type HandlerMap<TEnum extends string|number|symbol, THandler> = {
    [Property in TEnum] : THandler
}