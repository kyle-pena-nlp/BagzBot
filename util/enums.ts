
export function isEnumValue<T extends Record<string,string|number>>(value: any, enumType: T): value is T[keyof T] {
    return Object.values(enumType).includes(value);
}

export function assertNever(x: never): never {
    throw new Error("Unexpected object: " + x);
}

export function assertIs<T,V extends T>() {
    return true;
}