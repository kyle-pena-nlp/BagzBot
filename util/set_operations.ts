interface SetLike<T> {
    has(x : T) : boolean;
    add(x : T) : SetLike<T>;
    [Symbol.iterator](): Iterator<T>;
}

interface SetLikeCtor<T,V extends SetLike<T>> {
    new() : V
}

export class SetWithKeyFn<T> implements SetLike<T> {
    private keyFn : (a : T) => string;
    private keySet : Set<string> = new Set<string>();
    private items : T[] = [];
    constructor(items : T[], keyFn : (a : T) => string) {
        this.keyFn = keyFn;
        for (const item of items) {
            this.add(item);
        }
    }
    has(x : T) : boolean {
        const key = this.keyFn(x);
        return this.keySet.has(key);
    }
    add(x : T) : SetWithKeyFn<T> {
        const key = this.keyFn(x);
        if (!this.keySet.has(key)) {
            this.items.push(x);
        }
        return this;
    }
    delete(x : T) {
        const key = this.keyFn(x);
        if (this.keySet.has(key)) {
            this.items = this.items.filter(item => this.keyFn(item) !== key);
            this.keySet.delete(key);
        }
    }
    [Symbol.iterator](): Iterator<T> {
        let index = 0;
        return {
            next: (): IteratorResult<T> => {
                if (index < this.items.length) {
                    return { value: this.items[index++], done: false };
                } else {
                    return { done: true, value: null as any };
                }
            }
        };
    }
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

export function setUnion<T,V extends SetLike<T>>(a : SetLike<T>, b : SetLike<T>, ctor : SetLikeCtor<T,V>) : SetLike<T> {
    const union = new ctor();
    for (const item of a) {
        union.add(item);
    }
    for (const item of b) {
        union.add(item);
    }
    return union;
}