
import { DecimalizedAmount, DecimalizedAmountMap, toFriendlyString } from "../../../decimalized";
import { Position } from "../../../positions";
import { ReadonlySparseArray } from "./readonly_sparse_array";

// represents the location of a position within the peak price tracker
// Interpretation: Under this price, at this array index.
export type PeakPriceLocation = [DecimalizedAmount,number];

export function toObjectLocationString(location : PeakPriceLocation) {
    const [price,index] = location;
    return `${toFriendlyString(price, 4)}:${index.toString()}`
}

export class UserPeakPriceLocationMap {
    inner : Map<number,LocationSet> = new Map<number,LocationSet>();
    add(userID : number, location : PeakPriceLocation) {
        let locationSet = this.inner.get(userID);
        if (locationSet == null) {
            locationSet = new LocationSet()
            this.inner.set(userID, locationSet);
        }
        locationSet.add(location);
    }
    remove(userID : number, location : PeakPriceLocation) {
        const locationSet = this.inner.get(userID);
        if (locationSet == null) {
            return;
        }
        locationSet.delete(location);
    }
    list(userID : number) : PeakPriceLocation[] {
        const locationSet = this.inner.get(userID);
        if (locationSet == null) {
            return [];
        }
        return locationSet.items;
    }
    clear() {
        this.inner.clear();
    }
    _removeFromAnyUser(positionID : string, all : DecimalizedAmountMap<ReadonlySparseArray<Position>>) {
        for (const [_,locationSet] of this.inner) {
            for (const location of locationSet.items) {
                const [price,index] = location;
                const positions = all.get(price);
                if (positions == null) {
                    continue;
                }
                const position = positions[index];
                if (position == null) {
                    continue;
                }
                if (position.positionID !== positionID) {
                    continue;
                }
                this.remove(position.userID, location);
            }
        }
    }
}

// These operations are O(n), but I think n is generally small here.
// I could maybe implement something like 'StructuralHash'... TODO sometime later.
export class LocationSet {

    items : PeakPriceLocation[]  = [];
    
    add(newItem : PeakPriceLocation) : boolean {
        for (const item of this.items) {
            if (LocationSet.equals(item,newItem)) {
                return false;
            }
        }
        this.items.push(newItem);
        return true;
    }
    has(maybeHasItem : PeakPriceLocation) : boolean {
        for (const item of this.items) {
            if (LocationSet.equals(item,maybeHasItem)) {
                return true;
            }
        }
        return false;
    }
    delete(itemToDelete : PeakPriceLocation) {
        this.items = this.items.filter(item => !LocationSet.equals(item,itemToDelete));
    }
    private static equals(a : PeakPriceLocation, b : PeakPriceLocation) : boolean {
        // TODO: equals operator for DecimalizedAmount?
        return a[0].decimals === b[0].decimals && 
            a[0].tokenAmount === b[0].tokenAmount &&
            a[1] === b[1];
    }
}
