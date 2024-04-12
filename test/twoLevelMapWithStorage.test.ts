import { DurableObjectStorage } from "@cloudflare/workers-types";
import { Integer, Structural, TwoLevelMapWithStorage } from "../util";
import { FakeDurableObjectStorage } from "./fakeStorage";

export interface Thing {
    readonly [ key : string ] : Structural
    value : number
}

test("add_flush_is_put", async () => {
    const fakeStorage = new FakeDurableObjectStorage();
    const storage = new TwoLevelMapWithStorage<Integer,string,Thing>("xPrefix", 'Integer', 'string');
    storage.insert(0, "0", { value : 0 })
    await storage.flushToStorage(fakeStorage as unknown as DurableObjectStorage);
    expect(fakeStorage.puts).toMatchObject( { "xPrefix:0|0": { value : 0 }});
    expect(fakeStorage.deletes).toHaveLength(0);
})

test("add_flush_change_flush_is_put_latest", async () => {
    const fakeStorage = new FakeDurableObjectStorage();
    const storage = new TwoLevelMapWithStorage<Integer,string,Thing>("xPrefix", 'Integer', 'string');
    storage.insert(0, "0", { value : 0 });
    await storage.flushToStorage(fakeStorage as unknown as DurableObjectStorage);
    storage.insert(0, "0", { value : 1 });
    await storage.flushToStorage(fakeStorage as unknown as DurableObjectStorage);
    expect(fakeStorage.puts).toMatchObject( { "xPrefix:0|0": { value : 1 }});
    expect(fakeStorage.deletes).toHaveLength(0);
})

test("add_flush_same_flush_is_noop", async () => {
    const fakeStorage = new FakeDurableObjectStorage();
    const storage = new TwoLevelMapWithStorage<Integer,string,Thing>("xPrefix", 'Integer', 'string');
    storage.insert(0, "0", { value : 0 });
    await storage.flushToStorage(fakeStorage as unknown as DurableObjectStorage);
    storage.insert(0, "0", { value : 0 });
    await storage.flushToStorage(fakeStorage as unknown as DurableObjectStorage);
    expect(Object.keys(fakeStorage.puts)).toHaveLength(0);
    expect(fakeStorage.deletes).toHaveLength(0);
})

test("add_change_is_put_latest", async() => {
    const fakeStorage = new FakeDurableObjectStorage();
    const storage = new TwoLevelMapWithStorage<Integer,string,Thing>("xPrefix", 'Integer', 'string');
    storage.insert(0, "0", { value : 0 });
    storage.insert(0, "0", { value : 1 });
    await storage.flushToStorage(fakeStorage as unknown as DurableObjectStorage);
    expect(fakeStorage.puts).toMatchObject({ "xPrefix:0|0": { value : 1 } });
    expect(fakeStorage.deletes).toHaveLength(0);
})

test("insert_delete_flush_is_noop", async () => {
    const fakeStorage = new FakeDurableObjectStorage();
    const storage = new TwoLevelMapWithStorage<Integer,string,Thing>("xPrefix", 'Integer', 'string');
    storage.insert(0, "0", { value : 0 });
    storage.delete(0, "0");
    await storage.flushToStorage(fakeStorage as unknown as DurableObjectStorage);
    expect(Object.keys(fakeStorage.puts)).toHaveLength(0);
    expect(fakeStorage.deletes).toHaveLength(0);
})

test("insert_flush_delete_flush_is_delete", async () => {
    const fakeStorage = new FakeDurableObjectStorage();
    const storage = new TwoLevelMapWithStorage<Integer,string,Thing>("xPrefix", 'Integer', 'string');
    storage.insert(0, "0", { value : 0 });
    await storage.flushToStorage(fakeStorage as unknown as DurableObjectStorage);
    storage.delete(0, "0");
    await storage.flushToStorage(fakeStorage as unknown as DurableObjectStorage);
    expect(Object.keys(fakeStorage.puts)).toHaveLength(0);
    expect(fakeStorage.deletes).toContainEqual("xPrefix:0|0");
})

test("delete_flush_is_noop", async () => {
    const fakeStorage = new FakeDurableObjectStorage();
    const storage = new TwoLevelMapWithStorage<Integer,string,Thing>("xPrefix", 'Integer', 'string');
    storage.delete(0, "0");
    await storage.flushToStorage(fakeStorage as unknown as DurableObjectStorage);
    expect(Object.keys(fakeStorage.puts)).toHaveLength(0);
    expect(fakeStorage.deletes).toHaveLength(0);
})

test("delete_add_is_put", async () => {
    const fakeStorage = new FakeDurableObjectStorage();
    const storage = new TwoLevelMapWithStorage<Integer,string,Thing>("xPrefix", 'Integer', 'string');
    storage.delete(0, "0");
    storage.insert(0, "0", { value : 0 })
    await storage.flushToStorage(fakeStorage as unknown as DurableObjectStorage);
    expect(fakeStorage.puts).toMatchObject( { "xPrefix:0|0": { value : 0 }});
    expect(fakeStorage.deletes).toHaveLength(0);
})

test("delete_adddifferent_flush_is_put", async () => {
    const fakeStorage = new FakeDurableObjectStorage();
    const storage = new TwoLevelMapWithStorage<Integer,string,Thing>("xPrefix", 'Integer', 'string');
    storage.delete(0, "0");
    storage.insert(0, "1", { value : 1 })
    await storage.flushToStorage(fakeStorage as unknown as DurableObjectStorage);
    expect(fakeStorage.puts).toMatchObject( { "xPrefix:0|1": { value : 1 }});
    expect(fakeStorage.deletes).toHaveLength(0);
})
