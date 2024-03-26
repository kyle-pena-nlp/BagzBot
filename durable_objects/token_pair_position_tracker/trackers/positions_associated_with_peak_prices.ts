import { DecimalizedAmount, DecimalizedAmountMap } from "../../../decimalized";
import { logError, logInfo } from "../../../logging";
import { Position, PositionStatus } from "../../../positions";
import { PeakPriceLocation, UserPeakPriceLocationMap as UserIDLocationMap, toObjectLocationString } from "./location";
import { ReadonlySparseArray } from "./readonly_sparse_array";


// Be cautious modifying this class. Update the tests and think carefully.
// If this thing goes wrong, the whole bot breaks.
export class PositionsAssociatedWithPeakPrices extends DecimalizedAmountMap<ReadonlySparseArray<Position>> {

    // An actively updated cache : map from positionID to the object location in this datastructure
    // see updateLookCache and removeFromLookupCache
    positionIDMap : Map<string,PeakPriceLocation> = new Map<string,PeakPriceLocation>();
    
    // An actively updated cache: map from userID to the set of object locations of the user's positions.
    // see updateLookCache and removeFromLookupCache
    userIDMap : UserIDLocationMap = new UserIDLocationMap();

    constructor() {
        super();
    }

    // get positions associated with this peak price
    get(price : DecimalizedAmount) : ReadonlySparseArray<Position>|undefined {
        return super.get(price);
    }

    // get the position associated with this position id
    getPosition(positionID : string) : Position|undefined {
        const location = this.positionIDMap.get(positionID);
        if (location == null) {
            return undefined;
        }
        const [price,index] = location;
        const position = (this.get(price)||[])[index];
        if (position == null) {
            logError(`positionIDMap pointed to non-existent position for '${positionID}': ${toObjectLocationString(location)}`)
        }
        return position;
    }

    // list all the positions by user
    listByUser(userID : number) : Position[] {
        const locations = this.userIDMap.list(userID);
        if (locations == null) {
            return [];
        }
        const result : Position[] = [];
        for (const location of locations) {
            const [price,index] = location;
            const position = (this.get(price)||[])[index];
            if (position == null) {
                logError(`userIDMap pointed to non-existent Position for [${toObjectLocationString(location)}]`);
                continue;
            }
            if (position.userID !== userID) {
                logError(`userIDMap pointed to position with wrong user ID for [${toObjectLocationString(location)}]. Expected ${userID}, was ${position.userID}`);
                continue;
            }
            result.push(position);
        }
        return result;
    }

    // *idempotentally* add a new position to this peak price
    add(price : DecimalizedAmount, position : Position) {
        if (this.positionIDMap.has(position.positionID)) {
            this.removePosition(position.positionID);
        }
        const positionsForPrice = super.get(price);
        if (positionsForPrice == null) {
            const location : PeakPriceLocation = [price, 0];            
            this.updateLookupCaches(position, location);            
            this.set(price, [position] as ReadonlySparseArray<Position>);
        }
        else {
            // nextIndex will be the next available slot on the array
            const nextIndex = positionsForPrice.length;
            const location : PeakPriceLocation = [price, nextIndex];
            this.updateLookupCaches(position, location);
            (positionsForPrice as Position[]).push(position);
        }
    }

    // specifically set a price at a specific index in the sparse array.
    // should only be used for initialization code.
    _setAtIndex(price: DecimalizedAmount, index :  number, position : Position) {
        const location : PeakPriceLocation = [price,index];
        const positionsForPrice = super.get(price);
        if (positionsForPrice != null) {
            const existingPositionAtIndex = positionsForPrice[index];
            if (existingPositionAtIndex != null) {
                this.removeFromLookupCaches(existingPositionAtIndex, location);
            }
            this.updateLookupCaches(position, location);
            (positionsForPrice as Position[])[index] = position;
        }
        else {
            const newArray : Position[] = [];
            this.set(price, newArray as ReadonlySparseArray<Position>);
            this.updateLookupCaches(position, location);
            newArray[index] = position;
        }
    }

    // set the positions array for a specific peak price
    set(price : DecimalizedAmount, positions : ReadonlySparseArray<Position>|(Position|undefined)[]) {
        
        // remove any existing locationMap entries associated with this array of positions
        const existingPositions = super.get(price)||[];
        existingPositions.forEach((position,index) => {
            if (position == null) {
                return;
            }
            const location : PeakPriceLocation = [price,index];
            this.removeFromLookupCaches(position, location);
        });

        // set new locationMap entries associated with the positions passed in
        positions.forEach((position,index) => {
            if (position == null) {
                return;
            }
            const location : PeakPriceLocation = [price,index];
            this.updateLookupCaches(position, location);
        });

        // now that the book-keeping is complete, call the base class method
        super.set(price, positions as ReadonlySparseArray<Position>);

        return this;
    }
    clear() {
        this.positionIDMap.clear();
        this.userIDMap.clear();
        return super.clear();
    }  
    delete(price : DecimalizedAmount) {
        const existingPositions = super.get(price)||[];
        existingPositions.forEach((position,index) => {
            if (position == null) {
                return;
            }
            const location : PeakPriceLocation = [price,index];
            this.removeFromLookupCaches(position,location);
        });
        return super.delete(price);
    }
    markAsClosing(positionID : string) {
        const location = this.positionIDMap.get(positionID);
        if (location) {
            const [price,index] = location;
            const positionArray = super.get(price);
            if (positionArray) {
                const position = positionArray[index];
                if (position == null) {
                    logError(`Did not find position at ${toObjectLocationString(location)}`)
                    return;
                }
                if (position.positionID !== positionID) {
                    logError(`Position at location did not match expected id.  ${toObjectLocationString(location)}. Expected: ${positionID}, was: ${position.positionID}`);
                    return;
                }
                position.status = PositionStatus.Closing;
            }
        }
    }
    // *idempotentally* remove a position
    removePosition(positionID : string) {
        const location = this.positionIDMap.get(positionID);
        let positionFound = false;
        if (location) {
            const [price,index] = location;
            const positionArray = super.get(price);
            if (positionArray == null) {
                logError(`No position array found for price in ${toObjectLocationString(location)}`);
            }
            else {
                const position = positionArray[index];
                if (position == null) {
                    logError(`No position found at ${toObjectLocationString(location)}`);
                }
                else if (positionID !== position.positionID) {
                    logError(`Position at location ${toObjectLocationString(location)} did not have expected positionID.  Expected ${positionID}. Was ${position.positionID}`)
                }
                else {
                    positionFound = true;
                    position.status = PositionStatus.Closed;
                    delete (positionArray as Position[])[index];
                    this.removeFromLookupCaches(position, location);
                }
            }
        }
        // If for whatever reason the position is lingering in the lookup cache
        // (Despite not being able to find it)
        // We do a thorough sweep for it here.
        if (!positionFound) {
            logError(`Could not find position to remove: ${positionID} - this is a potentially serious problem.`)
            logInfo("Performing thorough sweep of lookup caches.")
            this.positionIDMap.delete(positionID);  
            this.userIDMap._removeFromAnyUser(positionID, this);
        }
    }
    getPeakPrice(positionID : string) : DecimalizedAmount|undefined {
        const location = this.positionIDMap.get(positionID);
        if (location == null) {
            return undefined;
        }
        return location[0];
    }
    updateLookupCaches(position : Position, location : PeakPriceLocation) {
        this.positionIDMap.set(position.positionID, location);
        this.userIDMap.add(position.userID, location);
    }
    removeFromLookupCaches(position : Position, location : PeakPriceLocation) {
        this.positionIDMap.delete(position.positionID);
        this.userIDMap.remove(position.userID, location);
    }
}