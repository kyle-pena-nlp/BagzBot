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