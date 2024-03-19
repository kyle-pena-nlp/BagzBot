export class FakeDurableObjectStorage {
    entries : Map<string,any> = new Map<string,any>();
    deletes : string[] = [];
    puts : Record<string,any> = {};
    constructor() {
    }
    list() {
        return this.entries;
    }
    async put(entries : Record<string,any>) {
        this.puts = entries;
        for (const key of Object.keys(entries)) {
            this.entries.set(key, entries[key]);
        }
    }
    async delete(keys : string[]) {
        this.deletes = [...keys];
        for (const key of keys) {
            this.entries.delete(key);
        }
    }
}