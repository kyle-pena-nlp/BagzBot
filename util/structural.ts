import { DecimalizedAmount, toNumber } from "../decimalized/decimalized_amount";

export type Structural = undefined|null|boolean|number|string|{ readonly [key : string] : Structural };

export class StructuralSet<T extends Exclude<Structural,undefined>> {
    items : T[] = [];
    add(newItem : T) : boolean {
        for (const item of this.items) {
            if (structuralEquals(item, newItem)) {
                return false;
            }
        }
        this.items.push(newItem);
        return true;
    }
    delete(itemToRemove : T) {
        this.items = this.items.filter(item => !structuralEquals(item,itemToRemove));
    }
    has(itemToFind : T) : boolean {
        const maybeFoundItem = this.items.find(item => structuralEquals(item,itemToFind));
        if (maybeFoundItem !== undefined) {
            return true;
        }
        else {
            return false;
        }
    }
}

export function writeIndentedToString(x : (Structural|Structural[])) : string {
    const lines : string[] = [];
    recIndentedToString(x, lines, 0);
    return lines.join("\r\n");
}

function recIndentedToString(x : (Structural|Structural[]), lines : string[], indents : number) {
    const prefix = "   ".repeat(indents||0);
    if (x === null) {
        lines.push(`${prefix}null`); 
    }
    else if (x === undefined) {
        lines.push(`${prefix}undefined`);
    }
    else if (typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean') {
        if(typeof x === 'string' && x.startsWith("SECRET")) {
            // paranoia here is probably good
            return;
        }
        lines.push(`${prefix}${x.toString()}`);
    }
    else if (Array.isArray(x)) {
        x.forEach((value,index) => {
            lines.push(`${prefix}${index.toString()}::`)
            recIndentedToString(value, lines, indents + 1);
        })
    }
    else {
        for (const key of Object.keys(x)) {
            const value = x[key];
            if (isDecimalizedAmount(value)) {
                lines.push(`${prefix}${key} (${toNumber(value)})`);
            }
            else {
                lines.push(`${prefix}${key}`);
            }
            recIndentedToString(value, lines, indents+1);
        }
    }
}

function isDecimalizedAmount(x : Structural) : x is DecimalizedAmount {
    return x != null && typeof x === 'object' && 'tokenAmount' in x && 'decimals' in x;
}

export function structuralEquals(x : Structural, y : Structural) : boolean {
    if (x == null || typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean') {
        return x === y;
    }
    else if (y == null || typeof y === 'string' || typeof y === 'number' || typeof y === 'boolean') {
        return false;
    }
    else {
        const keys = new Set<string>([...Object.keys(x), ...Object.keys(y)]);
        for (const key of keys) {
            if (!(key in x)) {
                return false;
            }
            if (!(key in y)) {
                return false;
            }
            // we could have infinite recurses here and i could fix with a weakmap memo but not today.
            const propertyEquals = structuralEquals(x[key], y[key]);
            if (!propertyEquals) {
                return false;
            }
        }
        return true;
    }
}