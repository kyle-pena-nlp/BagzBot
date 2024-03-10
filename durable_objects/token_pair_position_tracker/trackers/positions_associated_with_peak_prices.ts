import { Position, PositionStatus } from "../../../positions/positions";
import { DecimalizedAmountMap } from "../../../decimalized/decimalized_amount_map";
import { DecimalizedAmount } from "../../../decimalized/decimalized_amount";

export class PositionsAssociatedWithPeakPrices extends DecimalizedAmountMap<ReadonlyArray<Position>> {
    locationMap : Map<string,[DecimalizedAmount,number]> = new Map<string,[DecimalizedAmount,number]>();
    constructor() {
        super();
    }
    get(price : DecimalizedAmount) : ReadonlyArray<Position>|undefined {
        return super.get(price);
    }
    push(price : DecimalizedAmount, position : Position) {
        const positionsForPrice = super.get(price) as Position[];
        if (positionsForPrice) {
            const nextIndex = positionsForPrice.length;
            this.locationMap.set(position.positionID, [price, nextIndex]);
            positionsForPrice.push(position);
        }
        else {
            this.set(price, [position]);
        }
    }
    setAtIndex(price: DecimalizedAmount, index :  number, position : Position) {
        const positionsForPrice = super.get(price) as Position[];
        if (positionsForPrice) {
            const existingPositionAtIndex = positionsForPrice[index];
            if (existingPositionAtIndex) {
                this.locationMap.delete(existingPositionAtIndex.positionID);
            }
            this.locationMap.set(position.positionID, [price, index]);
            positionsForPrice[index] = position;
        }
        else {
            const newArray : Position[] = [];
            this.set(price, newArray);
            this.locationMap.set(position.positionID, [price, index]);
            newArray[index] = position;
        }
    }
    set(price : DecimalizedAmount, positions : Position[]) {
        
        // remove any existing locationMap entries associated with this array of positions
        const existingPositions = super.get(price)||[];
        for (const position of existingPositions) {
            this.locationMap.delete(position.positionID);
        }

        // set new locationMap entries associated with the positions passed in
        positions.forEach((position,index) => {
            this.locationMap.set(position.positionID, [price,index]);
        });

        // now that the book-keeping is complete, call the base class method
        super.set(price, positions);

        return this;
    }
    clear() {
        this.locationMap.clear();
        return super.clear();
    }  
    delete(price : DecimalizedAmount) {
        const existingPositions = super.get(price)||[];
        for (const position of existingPositions) {
            this.locationMap.delete(position.positionID);
        }
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
    markAsClosed(positionID : string) {
        const location = this.locationMap.get(positionID);
        if (location) {
            const [price,index] = location;
            const positionArray = super.get(price);
            if (positionArray) {
                const position = positionArray[index];
                if (position) {
                    position.status = PositionStatus.Closed;
                    delete (positionArray as Position[])[index]; // this leaves a hole in the array but simplifies code
                }
            }
        }
    }
}