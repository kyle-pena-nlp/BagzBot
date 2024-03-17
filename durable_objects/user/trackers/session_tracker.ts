import { randomUUID } from "node:crypto";
import { Structural } from "../../../util";

/*
    This class tracks 'Session State', which is values associated with a message (like a menu).
    It has a three-part map, that goes like this:
        messageID -> sessionID -> sessionKeys
        sesionKey -> sessionValue
    There are methods to store a value for a sessionKey, given a messageID
    There are also methods to clear the session for a messageID
    This has dirty tracking, and flushes any changes to storage on demand by flushToStorage
*/
export class SessionTracker {
    sessionIDs : Record<string,string> = {};
    sessionKeys : Record<string,string[]> = {};
    sessionValues : Record<string,Structural> = {};
    dirtyTracking : Set<string> = new Set<string>();
    deletedKeys : Set<string> = new Set<string>();
    constructor() {
    }
    initialize(entries : Map<string,any>) {
        // init from storage
        for (const entryKey of (entries.keys())) {
            const entryValue = entries.get(entryKey);
            const parsedKey = MessageIDKey.parse(entryKey) || SessionIDKey.parse(entryKey) || SessionKeyKey.parse(entryKey) || NotAKey.parse(entryKey);
            switch(parsedKey.keyType) {
                case KeyType.MessageID:
                    this.sessionIDs[parsedKey.toString()] = entryValue;
                    break;
                case KeyType.SessionID:
                    this.sessionKeys[parsedKey.toString()] = entryValue;
                    break;
                case KeyType.SessionKey:
                    this.sessionValues[parsedKey.toString()] = entryValue;
                    break;
            }
        }
    }
    async flushToStorage(storage : DurableObjectStorage) {

        if (this.deletedKeys.size == 0 && this.dirtyTracking.size == 0) {
            return;
        }
        
        const putEntries : Record<string,string[]|Structural> = {};
        for (const record of [this.sessionIDs, this.sessionKeys, this.sessionValues]) {
            for (const key of Object.keys(record)) {
                if (this.dirtyTracking.has(key)) {
                    const value = record[key];
                    putEntries[key] = value;
                }
            }
        }

        const putPromise = storage.put(putEntries).then(() => {
            this.dirtyTracking.clear();
        });
        const deletePromise = storage.delete([...this.deletedKeys]).then(() => {
            this.deletedKeys.clear();
        });
        await Promise.all([putPromise, deletePromise]);
    }
    ensureHasSession(messageID : number) {
        const messageIDKey = new MessageIDKey(messageID);
        if (!(messageIDKey.toString() in this.sessionIDs)) {
            this.sessionIDs[messageIDKey.toString()] = randomUUID();
            this.markAsDirty(messageIDKey);
        }
        const sessionIDKey = new SessionIDKey(this.sessionIDs[messageIDKey.toString()]);
        if (!(sessionIDKey.toString() in this.sessionKeys)) {
            this.sessionKeys[sessionIDKey.toString()] = [];
            this.markAsDirty(sessionIDKey);
        }
    }
    storeSessionValue(messageID : number, sessionKey : string, value : Structural) {
        this.ensureHasSession(messageID);
        const messageIDKey = new MessageIDKey(messageID);
        const sessionIDKey = new SessionIDKey(this.sessionIDs[messageIDKey.toString()]);
        const sessionKeys = this.sessionKeys[sessionIDKey.toString()];
        if (sessionKeys.indexOf(sessionKey) < 0) {
            sessionKeys.push(sessionKey);
            this.markAsDirty(sessionIDKey);
        }
        const sessionKeyKey = new SessionKeyKey(sessionIDKey, sessionKey);
        this.sessionValues[sessionKeyKey.toString()] = value;
        this.markAsDirty(sessionKeyKey);
    }
    getSessionValue(messageID : number, sessionKey : string) : Structural {
        this.ensureHasSession(messageID);
        const messageIDKey  = new MessageIDKey(messageID);
        const sessionIDKey  = new SessionIDKey(this.sessionIDs[messageIDKey.toString()]);
        const sessionKeyKey = new SessionKeyKey(sessionIDKey, sessionKey);
        return this.sessionValues[sessionKeyKey.toString()]||null;
    }
    getSessionValues(messageID : number) {
        this.ensureHasSession(messageID);
        const sessionID = this.sessionIDs[new MessageIDKey(messageID).toString()];
        const sessionKeys = this.sessionKeys[new SessionIDKey(sessionID).toString()];
        const session : Record<string,Structural> = {};
        for (const sessionKey of sessionKeys) {
            const sessionKeyKey = new SessionKeyKey(new SessionIDKey(sessionID), sessionKey);
            const value = this.sessionValues[sessionKeyKey.toString()];
            session[sessionKey] = value;
        }
        return session;
    }
    getSessionValuesWithPrefix(messageID : number, prefix : string) {
        this.ensureHasSession(messageID);
        const sessionID = this.sessionIDs[new MessageIDKey(messageID).toString()];
        const sessionKeys = this.sessionKeys[new SessionIDKey(sessionID).toString()];
        const sessionValuesMatchingPrefix : Record<string,Structural> = {};
        for (const sessionKey of sessionKeys) {
            const sessionKeyKey = new SessionKeyKey(new SessionIDKey(sessionID), sessionKey);
            if (sessionKeyKey.hasPrefix(prefix)) {
                const value = this.sessionValues[sessionKeyKey.toString()];
                sessionValuesMatchingPrefix[sessionKey] = value;
            }
        }
        return sessionValuesMatchingPrefix;
    }
    deleteSession(messageID : number) {
        const messageIDKey = new MessageIDKey(messageID);
        if (!(messageIDKey.toString() in this.sessionIDs)) {
            return;
        }
        const sessionID = this.sessionIDs[messageIDKey.toString()];
        delete this.sessionIDs[messageIDKey.toString()];
        this.markAsDeleted(messageIDKey);

        const sessionIDKey = new SessionIDKey(sessionID);
        if (!(sessionIDKey.toString() in this.sessionKeys)) {
            return;
        }
        const sessionKeys = this.sessionKeys[sessionIDKey.toString()];
        delete this.sessionKeys[sessionIDKey.toString()];
        this.markAsDeleted(sessionIDKey);

        for (const sessionKey of sessionKeys) {
            const sessionKeyKey = new SessionKeyKey(sessionIDKey, sessionKey);
            if (!(sessionKeyKey.toString() in this.sessionValues)) {
                continue;
            }
            delete this.sessionValues[sessionKeyKey.toString()];
            this.markAsDeleted(sessionKeyKey);
        }
    }
    private markAsDirty(key : MessageIDKey|SessionIDKey|SessionKeyKey) {
        this.deletedKeys.delete(key.toString());
        this.dirtyTracking.add(key.toString());
    }
    private markAsDeleted(key : MessageIDKey|SessionIDKey|SessionKeyKey) {
        this.dirtyTracking.delete(key.toString());
        this.deletedKeys.add(key.toString());
    }
}

enum KeyType {
    MessageID,
    SessionID,
    SessionKey,
    NotAKey
}

class MessageIDKey {
    messageID : number;
    keyType : KeyType;
    constructor(messageID : number) {
        this.messageID = messageID;
        this.keyType = KeyType.MessageID;
    }
    toString() : string {
        return `messageID:${this.messageID}`;
    }
    static parse(key : string) : MessageIDKey|null {
        const tokens = key.split(":");
        const firstToken = tokens[0];
        if (firstToken === 'messageID') {
            return new MessageIDKey(parseInt(tokens[1],10));
        }
        return null;
    }
}

class SessionIDKey {
    sessionID : string;
    keyType : KeyType;
    constructor(sessionID : string) {
        this.sessionID = sessionID;
        this.keyType = KeyType.SessionID;
    }
    toString() : string {
        return `sessionID:${this.sessionID}`;
    }
    static parse(key : string) : SessionIDKey|null {
        const tokens = key.split(":");
        const firstToken = tokens[0];
        if (firstToken === 'sessionID') {
            return new SessionIDKey(tokens[1]);
        }
        return null;
    }
}

class SessionKeyKey {
    sessionIDKey : SessionIDKey;
    sessionKey : string;
    keyType : KeyType;
    constructor(sessionIDKey : SessionIDKey, sessionKey : string) {
        this.sessionIDKey = sessionIDKey;
        this.sessionKey = sessionKey;
        this.keyType = KeyType.SessionKey;
    }
    toString() : string {
        return `sessionKey:${this.sessionIDKey.sessionID}:${this.sessionKey}`;
    }
    hasPrefix(prefix : string) {
        return this.sessionKey.startsWith(`${prefix}/`);
    }
    static parse(key : string) : SessionKeyKey|null {
        const tokens = key.split(":");
        const firstToken = tokens[0];
        if (firstToken == 'sessionKey') {
            return new SessionKeyKey(new SessionIDKey(tokens[1]), tokens[2]);
        }
        return null;
    }
}

class NotAKey {
    keyType : KeyType;
    constructor() {
        this.keyType = KeyType.NotAKey;
    }
    toString() {
        return '';
    }
    static parse(key : string) : NotAKey {
        return new NotAKey();
    }
}