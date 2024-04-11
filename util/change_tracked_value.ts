import { DurableObjectStorage } from "@cloudflare/workers-types";
import { Structural, structuralEquals } from "./structural";
export class ChangeTrackedValue<T extends Exclude<Structural,undefined>> {
    storageKey : string;
    _buffer : T;
    _value  : T;
    recordAllWriteEvents : boolean;
    ranInitialize : boolean = false;
    foundValueFromStorage : boolean = false;    
    constructor(storageKey : string, value : T, recordAllWriteEvents : boolean = false) {
        this.storageKey = storageKey;
        this._buffer = structuredClone(value);
        this._value = value;
        this.recordAllWriteEvents = recordAllWriteEvents;
    }
    set value(value : T) {
        this.foundValueFromStorage = true;
        this._value = value;
    }
    get value() : T {
        return this._value;
    }
    initialize(entries : Map<string,any>) {
        if (entries.has(this.storageKey)) {
            const storageValue = entries.get(this.storageKey) as T;
            this._buffer = structuredClone(storageValue);
            this._value = storageValue;
            this.foundValueFromStorage = true;
        }
        else {
            this.foundValueFromStorage = false;
        }
        this.ranInitialize = true;
    }
    async flushToStorage(storage : DurableObjectStorage, ledger : boolean = false) {
        if (!structuralEquals(this._buffer, this._value)) {
            await storage.put(this.storageKey, this._value).then(() => {
                this._buffer = structuredClone(this._value);
            });
            if (this.recordAllWriteEvents) {
                // TODO: write to alternative storage mechanism with all writes.
                /*await ledger.write(this._value).catch(r => {
                    logError("Could not write write event", this);
                });*/
            }
        }
    }
    certainlyHasNoStoredValue() : boolean {
        return this.ranInitialize && !this.foundValueFromStorage;
    }
}