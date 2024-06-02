import { DecimalizedAmount } from "../../../decimalized";
import { Position } from "../../../positions";
import { setDifference, setIntersection, structuralEquals } from "../../../util";



export class ClosedPositionsTracker {
    prefix : string = "closedPositionsTracker";
    positions : Record<string,Position> = {};
    _buffer : Record<string,Position> = {};
    constructor() {
    }
    has(positionID : string) {
        const key = new PKey(this.prefix, positionID).toString();
        return key in this.positions;
    }
    get(positionID : string) : Position|undefined {
        const key = new PKey(this.prefix, positionID).toString();
        if (key in this.positions) {
            return this.positions[key];
        }
        return undefined;
    }
    initialize(entries : Map<string,any>) {
        for (const [key,value] of entries) {
            if (this.matchesPrefix(key)) {
                this.positions[key] = value;
            }
        }
    }
    upsert(position : Position & { netPNL : DecimalizedAmount }) {
        const key = new PKey(this.prefix, position.positionID).toString();
        this.positions[key] = position;
    }
    listClosedPositions() : Position[] {
        const positions : Position[] = [];
        for (const key of Object.keys(this.positions)) {
            positions.push(this.positions[key]);
        }
        return positions;
    }
    clear() {
        for (const key in this.positions) {
            if (this.positions.hasOwnProperty(key)) {
                delete this.positions[key];
            }
        }
    }
    async flushToStorage(storage : DurableObjectStorage) {
        const [puts,deletes] = this.gen_diff();
        await storage.put(puts);
        await storage.delete(deletes);
    }
    private matchesPrefix(key : string) : boolean {
        return key.startsWith(`${this.prefix}:`);
    }
    private gen_diff() : [Record<string,Position>,string[]] {
        const currentKeys = new Set<string>(Object.keys(this.positions));
        const bufferKeys = new Set<string>(Object.keys(this._buffer));
        const putKeys = setDifference(currentKeys, bufferKeys, Set<string>);
        const deleteKeys = setDifference(bufferKeys, currentKeys, Set<string>);
        const commonKeys = setIntersection(currentKeys, bufferKeys, Set<string>);
        const changedValueKeys = new Set<string>();
        for (const commonKey of commonKeys) {
            const newValue = this.positions[commonKey];
            const oldValue = this._buffer[commonKey];
            if (!structuralEquals(newValue, oldValue)) {
                changedValueKeys.add(commonKey);
            }
        }
        const putEntries : Record<string,Position> = {};
        for (const putKey of putKeys) {
            putEntries[putKey] = this.positions[putKey];
        }
        for (const changedValueKey of changedValueKeys) {
            putEntries[changedValueKey] = this.positions[changedValueKey];
        }
        return [putEntries,[...deleteKeys]];
    }
}


class PKey {
    prefix : string;
    positionID : string;
    constructor(prefix : string, positionID : string) {
        this.prefix = prefix;
        this.positionID = positionID;
    }
    toString() {
        return `${this.prefix}:${this.positionID}`;
    }
}