
export type EnumValue<TEnum> = TEnum[keyof TEnum] & (number|string);
export type WithUserID<T> = { userID : number } & T;
export type WithMessage<T> = { messageID : number, chatID : number } & T;
export type WithTelegram<T> = WithUserID<T> & WithMessage<T>
export type WithMethod<T,TEnum> = { method : TEnum, data : T };
export type ResponseOf<TResponse> = { success : true, data : TResponse } | { success : false, message : string }
