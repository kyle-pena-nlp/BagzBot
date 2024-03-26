
export type SparseArrayCallbackFn<T> = (element : T|undefined, index : number, array : (T|undefined)[]) => void

// I created this type to enforce only using forEach with the values in the map.
// forEach only iterates over the non-deleted indices in a sparse array
// that's going to be critical for perf.
export interface ReadonlySparseArray<T> {
    readonly [ key : number ] : T|undefined
    length : number
    forEach : (callbackFn: SparseArrayCallbackFn<T>, thisArg ?: any) => void
    push : (...items:(T|undefined)[]) => void
}