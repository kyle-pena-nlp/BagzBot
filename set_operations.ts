export function setDifference<T>(a : Set<T>, b : Set<T>) : Set<T> {
    const difference = new Set<T>();
    for (const item of a) {
        if (!b.has(item)) {
            difference.add(item);
        }
    }
    return difference;
}


export function setIntersection<T>(a : Set<T>, b : Set<T>) {
    const intersection = new Set<T>();
    for (const item of a) {
        if (b.has(item)) {
            intersection.add(item);
        }
    }
    return intersection;
}