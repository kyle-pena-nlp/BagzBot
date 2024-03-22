export async function sleep(ms : number){
    await new Promise<void>(r=> setTimeout(()=>r(), ms));
}

// Usage: .then(pause(500))
export function pause<T>(ms : number) : (t : T) => Promise<T> {
    return async (t : T) => {
        await sleep(ms);
        return t;
    };
}