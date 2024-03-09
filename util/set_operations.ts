interface SetLike<T> {
    has(x : T) : boolean;
    add(x : T) : SetLike<T>;
    [Symbol.iterator](): Iterator<T>;
}

interface SetLikeCtor<T,V extends SetLike<T>> {
    new() : V
}

export function setDifference<T,V extends SetLike<T>>(a : SetLike<T>, b : SetLike<T>, ctor : SetLikeCtor<T,V>) : SetLike<T> {
    const difference = new ctor();
    for (const item of a) {
        if (!b.has(item)) {
            difference.add(item);
        }
    }
    return difference;
}


export function setIntersection<T,V extends SetLike<T>>(a : SetLike<T>, b : SetLike<T>, ctor : SetLikeCtor<T,V>) : SetLike<T> {
    const intersection = new ctor();
    for (const item of a) {
        if (b.has(item)) {
            intersection.add(item);
        }
    }
    return intersection;
}