import { logError } from "../logging";
import { tryParseBoolean } from "./booleans";
import { assertNever } from "./enums";
import { Integer, tryParseFloat } from "./numbers";
import { setDifference, setIntersection } from "./set_operations";
import { Structural, structuralEquals } from "./structural";

type KeyTypes = boolean|Integer|string;
type LiteralFor<T extends KeyTypes> = T extends boolean ? 'boolean' : (T extends Integer ? 'Integer' : (T extends string ? 'string' : never));

export class TwoLevelMapWithStorage<TKey1 extends KeyTypes,TKey2 extends KeyTypes,TValue extends Exclude<Structural,undefined>> {

    private prefix : string
    private type1  : LiteralFor<TKey1>
    private type2 : LiteralFor<TKey2>
    private _buffer : Map<TKey1,Map<TKey2,TValue>> = new Map<TKey1,Map<TKey2,TValue>>();
    private map     : Map<TKey1,Map<TKey2,TValue>> = new Map<TKey1,Map<TKey2,TValue>>();

    constructor(prefix : string, type1 : LiteralFor<TKey1>, type2 : LiteralFor<TKey2>) {
        if (prefix.includes("|") || prefix.includes(":")) {
            throw new Error(`Prefix ${prefix} cannot contain special character | and/or :`);
        }
        this.prefix = prefix;
        this.type1 = type1;
        this.type2 = type2;
    }

    insert(key1 : TKey1, key2 : TKey2, value : TValue) {
        if (!this.map.has(key1)) {
            this.map.set(key1, new Map<TKey2,TValue>());
        }
        let inner = this.map.get(key1);
        if (inner == null) {
            inner = new Map<TKey2,TValue>();
            this.map.set(key1, inner);
        }
        inner.set(key2,value);
    }

    delete(key1 : TKey1, key2: TKey2) : TValue|undefined {
        const inner = this.map.get(key1);
        if (inner == null) {
            return undefined;
        }
        const value = inner.get(key2);
        inner.delete(key2);
        return value;
    }

    list(key1 : TKey1) : TValue[] {
        const inner = this.map.get(key1);
        if (inner == null) {
            return [];
        }
        const values = [...inner.values()];
        return values;
    }

    get(key1 : TKey1, key2 : TKey2) : TValue|undefined {
        const inner = this.map.get(key1);
        if (inner == null) {
            return undefined;
        }
        return inner.get(key2);
    }

    initialize(entries : Map<string,any>) {
        const prefixRegex = this.prefixRegex();
        for (const [key,value] of entries) {
            if (!prefixRegex.test(key)) {
                continue;
            }
            const maybeParsedKey = TwoLevelKey.parse(this.stripPrefix(key), this.type1, this.type2);
            if (maybeParsedKey == null) {
                logError(`Invalid key of ${this.type1}|${this.type2}: ${key}`);
                continue;
            }
            this.insert(maybeParsedKey.key1, maybeParsedKey.key2, value);
        }
        this.overwriteBufferWithCurrentState();
    }

    prefixRegex() : RegExp {
        const regexEscapedPrefix = this.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`^${regexEscapedPrefix}:`);
    }

    async flushToStorage(storage : DurableObjectStorage) {
        const [putEntries,deletedKeys] = this.generateDiffFromItemsBuffer();        
        const putPromise = storage.put(putEntries);
        const deletePromise = storage.delete([...deletedKeys]);
        //logDebug(`${Object.keys(putEntries).length} puts.  ${deletedKeys.size} deletes.`)
        await Promise.all([putPromise,deletePromise])
        .catch(r => {
            logError(`failed to flush peak price tracker to storage`, r);
        })
        .then(() => {
            this.overwriteBufferWithCurrentState();
        });
    }

    private overwriteBufferWithCurrentState() {
        this._buffer.clear()
        // for each outer key of the map
        for (const [key1,inner] of this.map) {
            // get the inner map for the buffer (or make it, if DNE)
            let bufferInner = this._buffer.get(key1);
            if (bufferInner == null) {
                bufferInner = new Map<TKey2,TValue>();
                this._buffer.set(key1,bufferInner)
            }
            // for each value in the inner map
            for (const [key2,value] of inner) {
                // set a clone of it on the buffer
                bufferInner.set(key2, structuredClone(value));
            }
        }
    }

    private generateDiffFromItemsBuffer() : [Record<string,TValue>,Set<string>] {

        const keySet : Set<string> = new Set<string>();
        const flattened : Map<string,TValue> = new Map<string,TValue>();
        for (const [key1,inner] of this.map) {
            for (const [key2,value] of inner) {
                const stringKey = this.addPrefix(new TwoLevelKey(key1,key2).asString());
                flattened.set(stringKey,value);
                keySet.add(stringKey);
            }
        }

        const bufferKeySet : Set<string> = new Set<string>();
        const bufferFlattened : Map<string,TValue> = new Map<string,TValue>();
        for (const [key1,inner] of this._buffer) {
            for (const [key2,value] of inner) {
                const stringKey = this.addPrefix(new TwoLevelKey(key1,key2).asString());
                bufferFlattened.set(stringKey,value);
                bufferKeySet.add(stringKey);
            }
        }
        
        // common keys are puts if values are different
        const commonKeys = setIntersection(keySet,bufferKeySet,Set<string>);
        const puts : Record<string,TValue> = {};
        for (const commonKey of commonKeys) {
            const value = flattened.get(commonKey);
            const oldValue = bufferFlattened.get(commonKey);
            // !== deliberate because null is a legit value in Exclude<Structural,undefined>
            if (value !== undefined && oldValue !== undefined) {
                if (!structuralEquals(value,oldValue)) {
                    puts[commonKey] = value;
                }
            }
            else {
                logError(`::HIGH:: ${commonKey} should exist as common key in two level map. ${value} / ${oldValue}`)
            }
        }

        // new keys are puts
        const newKeys = setDifference(keySet,bufferKeySet,Set<string>);
        for (const newKey of newKeys) {
            const value = flattened.get(newKey);
            if (value !== undefined) {
                puts[newKey] = value;
            }
        }

        const deletedKeys = setDifference(bufferKeySet,keySet,Set<string>) as Set<string>;

        return [puts,deletedKeys];
    }

    private stripPrefix(str : string) : string {
        return str.replace(this.prefixRegex(),"");
    }

    private addPrefix(str : string) : string {
        return `${this.prefix}:${str}`;
    }
}

export class TwoLevelKey<TKey1 extends KeyTypes, TKey2 extends KeyTypes> {
    key1 : TKey1
    key2 : TKey2
    constructor(key1 : TKey1, key2 : TKey2) {
        this.key1 = key1;
        this.key2 = key2;
    }
    static parse<TKey1 extends KeyTypes,TKey2 extends KeyTypes>(str : string, type1 : LiteralFor<TKey1>, type2 : LiteralFor<TKey2>) : TwoLevelKey<TKey1,TKey2>|undefined {
        const tokens = str.split("|");
        if (tokens.length !== 2) {
            return undefined;
        }
        const key1 = parseKey<TKey1>(tokens[0], type1);
        if (key1 == null) {
            return undefined;
        }
        const key2 = parseKey<TKey2>(tokens[1], type2);
        if (key2 == null) {
            return undefined;
        }
        return new TwoLevelKey(key1,key2);
    }
    asString() : string {
        return `${this.key1.toString()}|${this.key2.toString()}`;
    }
}

function parseKey<TKey extends KeyTypes>(str : string, type : LiteralFor<TKey>) : TKey|undefined {
    if (type === 'boolean') {
        return tryParseBoolean(str) as TKey|undefined;
    }
    else if (type === 'Integer') {
        return tryParseFloat(str) as TKey|undefined;
    }
    else if (type === 'string') {
        return str as TKey|undefined;
    }
    else {
        assertNever(type);
    }
}