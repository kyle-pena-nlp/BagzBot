export type Structural = undefined|null|boolean|number|string|{ readonly [key : string] : Structural };

export function structuralEquals(x : Structural, y : Structural) {
    if (x == null || typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean') {
        return x === y;
    }
    else if (y == null || typeof y === 'string' || typeof y === 'number' || typeof y === 'boolean') {
        return false;
    }
    else {
        const keys = new Set<string>([...Object.keys(x), ...Object.keys(y)]);
        for (const key in keys) {
            if (!(key in x)) {
                return false;
            }
            if (!(key in y)) {
                return false;
            }
            // we could have infinite recurses here and i could fix with a weakmap memo but not today.
            return structuralEquals(x[key], y[key]);
        }
    }
}