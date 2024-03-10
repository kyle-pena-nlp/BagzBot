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