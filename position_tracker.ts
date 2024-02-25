import { Position } from "./common";

export class PositionTracker {
    positions : Record<string,Position> = {};
    dirtyTracking : Set<string> = new Set<string>();
    deletedKeys : Set<string> = new Set<string>();
    constructor() {
    }
    initialize(entries : Map<string,any>) {
        for (const entryKey of Object.keys(entries)) {
            const positionIDKey = PositionIDKey.parse(entryKey);
            if (positionIDKey) {
                const position = entries.get(positionIDKey.toString());
                this.positions[positionIDKey.toString()] = position;
            }
        }
    }
    async flushToStorage(storage : DurableObjectStorage) {
        const dumpRecord : Record<string,Position> = {};
        for (const key of this.dirtyTracking) {
            const value = this.positions[key];
            dumpRecord[key] = value;
        }
        const putPromise = storage.put(dumpRecord);
        const deletePromise = storage.delete([...this.deletedKeys]);
        await Promise.all([putPromise, deletePromise]).then(() => {
            this.dirtyTracking.clear();
            this.deletedKeys.clear();
        });
    }
    storePositions(positions: Position[]) {
        for (const position of positions) {
            const positionIDKey = new PositionIDKey(position.positionID);
            this.positions[positionIDKey.toString()] = position;
            this.markAsDirty(positionIDKey);
        }
    }
    deletePosition(positionID : string) {
        if (positionID in Object.keys(this.positions)) {
            const positionIDKey = new PositionIDKey(positionID);
            delete this.positions[positionIDKey.toString()];
            this.markAsDeleted(positionIDKey);
        }
    }
    getPositions() : Position[] {
        return Object.values(this.positions);
    }
    getPosition(positionID : string) : Position|null {
        const positionIDKey = new PositionIDKey(positionID);
        return this.positions[positionIDKey.toString()]||null;
    }
    private markAsDirty(key : PositionIDKey) {
        this.deletedKeys.delete(key.toString());
        this.dirtyTracking.add(key.toString());
    }
    private markAsDeleted(key : PositionIDKey) {
        this.dirtyTracking.delete(key.toString());
        this.deletedKeys.add(key.toString());
    }
}

class PositionIDKey {
    positionID : string
    constructor(positionID : string) {
        this.positionID = positionID;
    }
    toString() : string {
        return `positionID:${this.positionID}`;
    }
    static parse(key : string) {
        const tokens = key.split(":");
        const firstToken = tokens[0];
        if (firstToken === 'positionID') {
            return new PositionIDKey(tokens[1]);
        }
        return null;
    }
}