import { DurableObjectStorage } from "@cloudflare/workers-types";
import { Structural, structuralEquals } from "./structural";
export class ChangeTrackedValue<T extends Structural> {
    storageKey : string;
    _buffer : T;
    value  : T;
    constructor(storageKey : string, value : T) {
        this.storageKey = storageKey;
        this._buffer = structuredClone(value);
        this.value = value;
    }
    setValue(value : T) {
        this.value = value;
    }
    getValue() : T {
        return this.value;
    }
    initialize(entries : Map<string,any>) {
        if (entries.has(this.storageKey)) {
            const storageValue = entries.get(this.storageKey) as T;
            this._buffer = structuredClone(storageValue);
            this.value = storageValue;
        }
    }
    async flushToStorage(storage : DurableObjectStorage) {
        if (!structuralEquals(this._buffer, this.value)) {
            await storage.put(this.storageKey, this.value).then(() => {
                this._buffer = structuredClone(this.value);
            });
        }
    }
}