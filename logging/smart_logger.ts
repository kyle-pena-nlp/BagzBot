import { assertNever } from "../util";

type HasProperties = { [ key: string] : any }

type Loggable = null|undefined|boolean|string|number|symbol|bigint|HasProperties;

type WeakmapCompatible = HasProperties|symbol;

function isLoggable(x : any) : x is Loggable {
    return x === null ||
        x === undefined ||
        typeof x === 'string' || 
        typeof x == 'number' || 
        typeof x === 'boolean' || 
        typeof x === 'symbol' ||
        typeof x === 'bigint' ||
        (x != null && typeof x === 'object' && Object.keys(x).length > 0);
}

const keysToLookFor = [
    'message',
    'telegramUserID',
    'userID', // telegramUserID is sometimes called this instead
    'messageID',
    'chatID',
    'positionID',
    'status',
    'positionType',
    'address',
    'signature',
    'symbol',
    'description',
    'purpose',
    'length',
    'size',
    'token',
    'vsToken',
    'tokenAddress',
    'vsTokenAddress',
    'value',
    'code',
    'data',
    'err'
];

const fnsToLookFor = [
    'describe',
    'purpose'
];

// TODO: switch to emitting JSON

const FORBIDDEN_LOG_KEYS = ['wallet','privateKey','encryptedPrivateKey','bytesAsHexString'];

function digest(x : Loggable, memo : WeakMap<WeakmapCompatible,string>) : string {
    if (x === null) {
        return 'null';
    }
    else if (x === undefined) {
        return 'undefined';
    }
    else if (typeof x === 'string' || 
        typeof x == 'number' || 
        typeof x === 'boolean' || 
        typeof x === 'symbol' ||
        typeof x === 'bigint') {
        return x.toString();
    }
    let digestParts : string[] = [];
    for (const key of keysToLookFor) {
        // paranoia here is probably a good thing.
        if (FORBIDDEN_LOG_KEYS.includes(key)) {
            throw new Error("Programmer error.");
        }
        if (!(key in x)) {
            continue;
        }
        const value : any = x[key];
        if (isLoggable(value)) {
            const isWeakmapCompatible = value !== null && (typeof value === 'object' || typeof value === 'symbol');
            const valueDigest = (isWeakmapCompatible && memo.has(value)) ? memo.get(value)!! : digest(value, memo);
            if (isWeakmapCompatible) {
                memo.set(value,valueDigest);
            }
            digestParts.push(`[${key}]: [${valueDigest}]`);
        }
    }   
    for (const key of fnsToLookFor) {
        if (!(key in x)) {
            continue;
        }
        const callable = (x[key] as () => string);
        if (typeof callable !== 'function') {
            continue;
        }
        try {
            const value = callable();
            digestParts.push(`[${key}]: ${value}`);
        }
        catch{
        }
    }
    return digestParts.join(" :: ");
}

function logIt(xs : any[], level : 'error'|'info'|'debug') {
    const memo = new WeakMap<WeakmapCompatible,string>();
    const digestStrings : string[] = [];
    for (const x of xs) {
        if (!isLoggable(x)) {
            continue;
        }
        digestStrings.push(digest(x, memo));
    }
    const digestString = digestStrings.join(" // ");
    const logMsg = `${digestString}`;
    switch(level) {
        case 'error':
            console.error(logMsg);
            break;
        case 'info':
            console.info(logMsg);
            break;
        case 'debug':
            console.info(logMsg);
            break;
        default:
            assertNever(level);
    }
}

function logItSafe(xs : any[], type : 'error'|'info'|'debug') {
    try {
        logIt(xs,type);
    }
    catch {
        console.error("There was trying to generate a log message.");
    }
}

export function logError(...xs : any[]) {
    logItSafe(xs, 'error');
}

export function logInfo(...xs : any[]) {
    logItSafe(xs, 'info');
}

export function logDebug(...xs : any[]) {
    logItSafe(xs, 'info');
}