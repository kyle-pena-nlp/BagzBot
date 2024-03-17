export function safe<T,V>(callable : (t : T) => V) : (t : T|null|undefined) => V|null|undefined {
    return (t : T|null|undefined) => {
        if (t === null) {
            return null;
        }
        else if (t === undefined) {
            return undefined;
        }
        else {
            return callable(t);
        }
    };
}