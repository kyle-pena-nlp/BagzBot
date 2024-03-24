import { Position, PositionStatus } from "../../../positions";

export class UserPositionTracker {
    positions : Record<string,Position> = {};
    dirtyTracking : Set<string> = new Set<string>();
    deletedKeys : Set<string> = new Set<string>();
    constructor() {
    }
    initialize(entries : Map<string,any>) {
        const entryKeys = [...entries.keys()];
        for (const entryKey of (entryKeys)) {
            const positionIDKey = PositionIDKey.parse(entryKey);
            if (positionIDKey != null) {
                const position = entries.get(positionIDKey.toString());
                this.positions[positionIDKey.toString()] = position;
            }
        }
    }
    async flushToStorage(storage : DurableObjectStorage) {
        if (this.dirtyTracking.size == 0 && this.deletedKeys.size == 0) {
            return;
        }
        const putEntries : Record<string,Position> = {};
        for (const key of this.dirtyTracking) {
            const value = this.positions[key];
            putEntries[key] = value;
        }
        const putPromise = storage.put(putEntries).then(() => {
            this.dirtyTracking.clear();
        });
        const deletePromise = storage.delete([...this.deletedKeys]).then(() => {
            this.deletedKeys.clear();
        });
        await Promise.allSettled([putPromise, deletePromise]);
    }
    storePositions(positions: Position[]) {
        for (const position of positions) {
            const positionIDKey = new PositionIDKey(position.positionID);
            this.positions[positionIDKey.toString()] = position;
            this.markAsDirty(positionIDKey);
        }
    }
    removePositions(positionIDs : string[]) {
        for (const positionID of positionIDs) {
            const positionIDKey = new PositionIDKey(positionID);
            delete this.positions[positionIDKey.toString()];
            this.markAsDeleted(positionIDKey);
        }
    }
    closePosition(positionID : string) {
        // TODO: maybe, keep in list and mark status as closed???
        if (positionID in Object.keys(this.positions)) {
            const positionIDKey = new PositionIDKey(positionID);
            delete this.positions[positionIDKey.toString()];
            this.markAsDeleted(positionIDKey);
        }
    }
    listPositions() : Position[] {
        return Object.values(this.positions);
    }
    getPosition(positionID : string) : Position|null {
        const positionIDKey = new PositionIDKey(positionID);
        return this.positions[positionIDKey.toString()]||null;
    }
    markAsClosing(positionID : string) {
        const positionIDKey = new PositionIDKey(positionID);
        const position = this.positions[positionIDKey.toString()];
        if (position) {
            position.status = PositionStatus.Closing;
            this.markAsDirty(positionIDKey);
        }
    }
    setAsOpen(positionID : string) {
        const positionIDKey = new PositionIDKey(positionID);
        const position = this.positions[positionIDKey.toString()];
        if (position) {
            position.status = PositionStatus.Open;
            this.markAsDirty(positionIDKey);
        }
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
    positionID : string;
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