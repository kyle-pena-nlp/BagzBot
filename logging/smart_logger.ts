import { assertNever } from "../util";

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

function digest(x : any, memo : WeakMap<object,string>) : string {
    if (x == null || 
        typeof x === 'string' || 
        typeof x == 'number' || 
        typeof x === 'boolean' || 
        typeof x === 'undefined' ||
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
        const value = x[key];
        const isWeakmapCompatible = value !== null && (typeof value === 'object' || typeof value === 'symbol');
        const valueDigest = (isWeakmapCompatible && memo.has(value)) ? memo.get(value)!! : digest(value, memo);
        if (isWeakmapCompatible) {
            memo.set(value,valueDigest);
        }
        digestParts.push(`[${key}]: [${valueDigest}]`);
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
    const memo = new WeakMap<object,string>();
    const digestStrings : string[] = [];
    for (const x of xs) {
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

export function logError(...xs : any[]) {
    logIt(xs, 'error');
}

export function logInfo(...xs : any[]) {
    logIt(xs, 'info');
}

export function logDebug(...xs : any[]) {
    logIt(xs, 'debug');
}