import { DecimalizedAmount, DecimalizedAmountMap } from "../../../decimalized";
import { Position, PositionStatus } from "../../../positions";

// I created this type to enforce only using forEach with the values in the map.
// That's because forEach skips deleted slots in the array, which is important 
// as time goes on.

type SparseArrayCallbackFn<T> = (element : T|undefined, index : number, array : (T|undefined)[]) => void

interface ReadonlySparseArray<T> {
    readonly [ key : number ] : T|undefined
    length : number
    forEach : (callbackFn: SparseArrayCallbackFn<T>, thisArg ?: any) => void
    push : (...items:(T|undefined)[]) => void
}

export class PositionsAssociatedWithPeakPrices extends DecimalizedAmountMap<ReadonlySparseArray<Position>> {
    locationMap : Map<string,[DecimalizedAmount,number]> = new Map<string,[DecimalizedAmount,number]>();
    constructor() {
        super();
    }
    get(price : DecimalizedAmount) : ReadonlySparseArray<Position>|undefined {
        return super.get(price);
    }
    push(price : DecimalizedAmount, position : Position) {
        const positionsForPrice = super.get(price);
        if (positionsForPrice == null) {
            this.locationMap.set(position.positionID, [price, 0]);
            this.set(price, [position] as ReadonlySparseArray<Position>);
        }
        else {
            const nextIndex = positionsForPrice.length;
            this.locationMap.set(position.positionID, [price, nextIndex]);
            (positionsForPrice as Position[]).push(position);
        }
    }
    setAtIndex(price: DecimalizedAmount, index :  number, position : Position) {
        const positionsForPrice = super.get(price);
        if (positionsForPrice) {
            const existingPositionAtIndex = positionsForPrice[index];
            if (existingPositionAtIndex) {
                this.locationMap.delete(existingPositionAtIndex.positionID);
            }
            this.locationMap.set(position.positionID, [price, index]);
            (positionsForPrice as Position[])[index] = position;
        }
        else {
            const newArray : Position[] = [];
            this.set(price, newArray as ReadonlySparseArray<Position>);
            this.locationMap.set(position.positionID, [price, index]);
            newArray[index] = position;
        }
    }
    set(price : DecimalizedAmount, positions : ReadonlySparseArray<Position>|(Position|undefined)[]) {
        
        // remove any existing locationMap entries associated with this array of positions
        const existingPositions = super.get(price)||[];
        existingPositions.forEach((position) => {
            if (position == null) {
                return;
            }
            this.locationMap.delete(position.positionID);
        });

        // set new locationMap entries associated with the positions passed in
        positions.forEach((position,index) => {
            if (position == null) {
                return;
            }
            this.locationMap.set(position.positionID, [price,index]);
        });

        // now that the book-keeping is complete, call the base class method
        super.set(price, positions as ReadonlySparseArray<Position>);

        return this;
    }
    clear() {
        this.locationMap.clear();
        return super.clear();
    }  
    delete(price : DecimalizedAmount) {
        const existingPositions = super.get(price)||[];
        existingPositions.forEach((position) => {
            if (position == null) {
                return;
            }
            this.locationMap.delete(position.positionID);
        });
        return super.delete(price);
    }
    markAsClosing(positionID : string) {
        const location = this.locationMap.get(positionID);
        if (location) {
            const [price,index] = location;
            const positionArray = super.get(price);
            if (positionArray) {
                const position = positionArray[index];
                if (position) {
                    position.status = PositionStatus.Closing;
                }
            }
        }
    }
    removePosition(positionID : string) {
        const location = this.locationMap.get(positionID);
        if (location) {
            const [price,index] = location;
            const positionArray = super.get(price);
            if (positionArray) {
                const position = positionArray[index];
                if (position) {
                    position.status = PositionStatus.Closed;
                     // this leaves a hole in the array but avoid having to re-number locationMap
                    delete (positionArray as Position[])[index];
                }
            }
        }
    }
}