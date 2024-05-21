export function groupIntoBatches<T>(items : T[], size : number) : T[][] {
    const batches : T[][] = [];
    for (const item of items) {
        if (batches.length == 0) {
            batches.push([]);
        }
        let batch = batches[batches.length-1];
        if (batch.length >= size) {
            batches.push([]);
            batch = batches[batches.length-1];
        }
        batch.push(item);
    }
    return batches;
}

export function groupIntoRecord<T,TKey extends string|number|symbol>(items : Iterable<T>, keySelector : (t : T) => TKey) : Record<TKey,T[]> {
    const grouped : Record<TKey,T[]> = {} as Record<TKey,T[]>;
    for (const item of items) {
        const key = keySelector(item);
        if (!(key in grouped)) {
            grouped[key] = [];
        }
        grouped[key].push(item);
    }
    return grouped;
}

export function groupIntoMap<T,TKey>(items : Iterable<T>, keySelector : (t : T) => TKey) {
    const grouped : Map<TKey,T[]> = new Map<TKey,T[]>();
    for (const item of items) {
        const key = keySelector(item);
        const itemsForKey = grouped.get(key);
        if (itemsForKey) {
            itemsForKey.push(item);
        }
        else {
            grouped.set(key, [item]);
        }
    }
    return grouped;
}

export function shuffle<T>(array :T[]) : T[] {
    return array
        .map(value => ({ value, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value);
}

export function deduplicate<T>(array : T[], keyFn : (a : T) => string) : T[] {
    const uniqueItems : T[] = [];
    const keySet = new Set<string>();
    for (const item of array) {
        const key = keyFn(item);
        if (keySet.has(key)) {
            continue;
        }
        else {
            keySet.add(key);
        }
        uniqueItems.push(item);
    }
    return uniqueItems;
}