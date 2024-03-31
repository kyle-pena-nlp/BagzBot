export type WithUserID<T> = { userID : number } & T;
export type WithMethod<T,TEnum> = { method : TEnum, data : T };
export type ResponseOf<TResponse> = { success : true, data : TResponse } | { success : false, message : string }
