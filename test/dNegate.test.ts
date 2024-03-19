import { DecimalizedAmount, dNegate } from "../decimalized";

test("dSub_negate_pos_whole_number", () => {
    const result = dNegate(d(10,0));
    expect(result).toEqual(d(-10,0));
});

test("dSub_negate_neg_whole_number", () => {
    const result = dNegate(d(-10,0));
    expect(result).toEqual(d(10,0));
});

test("dSub_negate_pos_mixed_number", () => {
    const result = dNegate(d(11,1));
    expect(result).toEqual(d(-11,1));
});

test("dSub_negate_neg_mixed_number", () => {
    const result = dNegate(d(-11,1));
    expect(result).toEqual(d(11,1));
});

test("dSub_negate_pos_fractional_number", () => {
    const result = dNegate(d(11,2));
    expect(result).toEqual(d(-11,2));
});

test("dSub_negate_neg_fractional_number", () => {
    const result = dNegate(d(-11,2));
    expect(result).toEqual(d(11,2));
});

test("dSub_negate_reallySmall", () => {
    const result = dNegate(d(2,-19));
    expect(result).toEqual(d(-2,-19));
});

test("dSub_negate_reallyBig", () => {
    const result = dNegate(d(2,19));
    expect(result).toEqual(d(-2,19));
});

test("dSub_negate_zero", () => {
    const result = dNegate(d(0,1));
    expect(result).toEqual(d(0,0));
});

function d(s : string|number, d : number) : DecimalizedAmount {
    return {
        tokenAmount : s.toString(),
        decimals : d
    }
}