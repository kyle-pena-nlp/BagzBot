
export function isEnumValue<T extends Record<string,string|number>>(value: any, enumType: T): value is T[keyof T] {
    return Object.values(enumType).includes(value);
}