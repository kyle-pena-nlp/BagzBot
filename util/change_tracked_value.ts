import { DurableObjectStorage } from "@cloudflare/workers-types";
import { Structural, structuralEquals } from "./structural";
export class ChangeTrackedValue<T extends Exclude<Structural,undefined>> {
    storageKey : string;
    _buffer : T;
    value  : T;
    recordAllWriteEvents : boolean;
    initializationAttempted : boolean = false;
    initialized : boolean = false;    
    constructor(storageKey : string, value : T, recordAllWriteEvents : boolean = false) {
        this.storageKey = storageKey;
        this._buffer = structuredClone(value);
        this.value = value;
        this.recordAllWriteEvents = recordAllWriteEvents;
    }
    setValue(value : T) {
        this.value = value;
    }
    getValue() : T {
        return this.value;
    }
    initialize(entries : Map<string,any>) {
        this.initializationAttempted = true;
        if (entries.has(this.storageKey)) {
            const storageValue = entries.get(this.storageKey) as T;
            this._buffer = structuredClone(storageValue);
            this.value = storageValue;
            this.initialized = true;
        }
        else {
            this.initialized = false;
        }
    }
    async flushToStorage(storage : DurableObjectStorage, ledger : boolean = false) {
        if (!structuralEquals(this._buffer, this.value)) {
            await storage.put(this.storageKey, this.value).then(() => {
                this._buffer = structuredClone(this.value);
            });
            if (this.recordAllWriteEvents) {
                // TODO: write to alternative storage mechanism with all writes.
                /*await ledger.write(this.value).catch(r => {
                    logError("Could not write write event", this);
                });*/
            }
        }
    }
}