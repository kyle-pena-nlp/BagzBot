const keysToLookFor = [
    'telegramUserID',
    'userID', // telegramUserID is sometimes called this instead
    'messageID',
    'message',
    'chatID',
    'positionID',
    'address',
    'symbol',
    'status',
    'description',
    'purpose',
    'length',
    'size'
];

const fnsToLookFor = [
    'describe',
    'purpose'
];

export class BotError {
    userID : number
    chatID : number
    message : string
    constructor(userID : number, chatID : number, message : string) {
        this.userID = userID;
        this.chatID = chatID;
        this.message = message;
    }
}

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
    for (const key in keysToLookFor) {
        // paranoia here is probably a good thing.
        if (key === 'wallet' || key === 'privateKey') {
            throw new Error("Programmer error.");
        }
        const value = x[key];
        const valueDigest = (memo.has(value)) ? memo.get(value)!! : digest(value, memo);
        memo.set(value,valueDigest);
        digestParts.push(`[${key}]: [${valueDigest}]`);
    }   
    for (const key in fnsToLookFor) {
        const callable = (x[key] as () => string);
        digestParts.push(`[${key}]: ${callable()}`);
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
    const now = Date.now();
    const logMsg = `${now} :: ${digestString}`;
    switch(level) {
        case 'error':
            console.error(logMsg);
        case 'info':
            console.info(logMsg);
        case 'debug':
            console.info(logMsg);
        default:
            throw new Error("Programmer error.");
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