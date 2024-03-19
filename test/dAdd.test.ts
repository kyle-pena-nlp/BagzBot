import { DecimalizedAmount, dAdd } from "../decimalized";

test("dAdd_pos_pos_same_decimals", () => {
    const result = dAdd(d(10,2), d(7,2));
    expect(result).toEqual(d(17,2));
})

test("dAdd_pos_neg_same_decimals", () => {
    const result = dAdd(d(10,0), d(-7,0));
    expect(result).toEqual(d(3,0));
})

test("dAdd_neg_pos_same_decimals", () => {
    const result = dAdd(d(-8,0), d(10,0));
    expect(result).toEqual(d(2,0));
})

test("dAdd_neg_neg_same_decimals", () => {
    const result = dAdd(d(-8,0), d(-7,0));
    expect(result).toEqual(d(-15,0));
})

test("dAdd_pos_pos_different_decimals_1", () => {
    const result = dAdd(d(1,1), d(2,2));
    expect(result).toEqual(d(12,2));
})

test("dAdd_pos_pos_different_decimals_2", () => {
    const result = dAdd(d(1,2), d(2,1));
    expect(result).toEqual(d(21,2));
})

test("dAdd_pos_pos_different_decimals_3", () => {
    const result = dAdd(d(12,1), d(34,2));
    expect(result).toEqual(d(154,2));
})

function d(s : string|number, d : number) : DecimalizedAmount {
    return {
        tokenAmount : s.toString(),
        decimals : d
    }
}