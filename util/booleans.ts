export function strictParseBoolean(s : string) : boolean {
    if (s === 'true') {
        return true;
    }
    else if (s === 'false') {
        return false;
    }
    throw new Error(`${s} not a valid boolean value`);
}

export function tryParseBoolean(s : string) : boolean | undefined {
    if (s === 'true') {
        return true;
    }
    else if (s === 'false') {
        return false;
    }
    return;
}