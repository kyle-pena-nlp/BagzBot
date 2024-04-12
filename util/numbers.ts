export type Integer = number;

// this doesn't give compile-time type safety but expresses intent.
export function isInteger(x : number) : x is Integer {
    return Number.isInteger(x);
}

export function tryParseFloat(x : string|null|undefined) : number|null {
    if (x == null) {
        return null;
    }
    else {
        const result = parseFloat(x);
        if (Number.isNaN(result)) {
            return null;
        }
        else {
            return result;
        }
    }
}

export function tryParseInt(x : string|null|undefined) : number|null {
    if (x == null) {
        return null;
    }
    else {
        const result = parseInt(x,10);
        if (Number.isNaN(result)) {
            return null;
        }
        else {
            return result;
        }
    }
}

export function strictParseInt(x : string) : number {
    const result = tryParseInt(x);
    if (result == null) {
        throw new Error(`string '${x}' is not parseable as an int`);
    }
    return result;
}

export function strictParseFloat(x : string) : number {
    const result = tryParseFloat(x);
    if (result == null) {
        throw new Error(`string '${x}' is not parseable as a float`);
    }
    return result;
}