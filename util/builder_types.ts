export type WithUserID<T> = { userID : number } & T;
export type WithMethod<T,TEnum> = { method : TEnum, data : T };
export type ResponseOf<TResponse> = { success : true, data : TResponse } | { success : false, message : string }

type WithNoIndexers<T> =  {
    [P in keyof T as string extends P ? never : number extends P ? never : P]: T[P]
};

export type Subtract<T,V> = Omit<WithNoIndexers<T>, keyof WithNoIndexers<V>>;

export type Intersect<T, V> = {
    [K in keyof WithNoIndexers<T> & keyof WithNoIndexers<V>]: T[K];
};

type ArrHasAllPropsOf<TArr extends readonly any[], TObj> =  (keyof TObj) extends TArr[number] ? TArr : never;

export function ensureArrayIsAllPropsOf<TObj>() {
    return function<TArr extends readonly any[]>(props: ArrHasAllPropsOf<TArr,TObj>) {
        return props;
    }
}

type ArrIsOnlyPropsOf<TArr extends readonly any[], TObj> = TArr[number] extends (keyof TObj) ? TArr : never;

export function ensureArrayIsOnlyPropsOf<TObj>() {
    return function<TArr extends readonly any[]>(props : ArrIsOnlyPropsOf<TArr,TObj>) {
        return props;
    }
}

type ExactlyThePropertiesOf<TArr extends readonly any[], TObj> = (keyof TObj) extends TArr[number] ? TArr[number] extends (keyof TObj) ? TArr : never : never;

export function ensureArrayIsAllAndOnlyPropsOf<TObj>() {
    return function<TArr extends readonly any[]>(props : ExactlyThePropertiesOf<TArr,TObj>) {
        return props;
    }
}

// for each key in TObj, make a mapped type where, if it can be assigned to any entry in TArr, make it never.
// Then, union all the types in the mapped type (which is never if at least one is never)
// If that is never, return never, else, TArr
type NoPropertiesOf<TArr extends readonly any[], TObj> = {
    [K in keyof TObj]: K extends TArr[number] ? never : K
}[keyof TObj] extends never ? never : TArr;

export function ensureNoProperties<TObj>() {
    return function<TArr extends readonly any[]>(props : NoPropertiesOf<TArr,TObj>) {
        return props;
    }
}


