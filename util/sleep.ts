export async function sleep(ms : number){
    await new Promise<void>(r=> setTimeout(()=>r(), ms));
}

export function pause<T>(ms : number) : (t : T) => Promise<T> {
    return async (t : T) => {
        sleep(ms);
        return t;
    };
}