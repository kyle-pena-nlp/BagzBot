import { DecimalizedAmount, dSub } from "../decimalized";

test("dSub_pos_pos_same_decimals", () => {
    const result = dSub(d(10,1), d(7,1));
    expect(result).toEqual(d(3,1));
});

test("dSub_pos_pos_same_decimals_neg_result", () => {
    const result = dSub(d(10,1), d(13,1));
    expect(result).toEqual(d(-3,1));
});


test("dSub_pos_pos_same_decimals_eq_zero", () => {
    const result = dSub(d(7,1), d(7,1));
    expect(result).toEqual(d(0,0));
});

test("dSub_neg_neg_same_decimals_eq_zero", () => {
    const result = dSub(d(-7,1), d(-7,1));
    expect(result).toEqual(d(0,0));
});

test("dSub_pos_neg_same_decimals", () => {
    const result = dSub(d(7,1), d(-3,1));
    expect(result).toEqual(d(10,1));
});

test("dSub_neg_pos_same_decimals", () => {
    const result = dSub(d(-6,1), d(3,1));
    expect(result).toEqual(d(-9,1));
});

test("dSub_pos_pos_different_decimals", () => {
    const result = dSub(d(6,1), d(3,3));
    expect(result).toEqual(d(597,3));
});

test("dSub_pos_neg_different_decimals", () => {
    const result = dSub(d(6,1), d(-3,3));
    expect(result).toEqual(d(603,3));
});

test("dSub_neg_pos_different_decimals", () => {
    const result = dSub(d(-5,1), d(3,3));
    expect(result).toEqual(d(-503,3));
});

test("dSub_neg_neg_different_decimals", () => {
    const result = dSub(d(-5,1), d(-3,3));
    expect(result).toEqual(d(-497,3));
});

test("dSub_pos_pos_different_decimals_neg_result", () => {
    const result = dSub(d(10,2), d(13,1));
    expect(result).toEqual(d(-120,2));
});

function d(s : string|number, d : number) : DecimalizedAmount {
    return {
        tokenAmount : s.toString(),
        decimals : d
    }
}