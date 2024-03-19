import { DecimalizedAmount, toFriendlyString } from "../decimalized";

const SIG_FIGS = 9;

test("pos_whole", () => {
    expect(toFriendlyString(d(100,0),SIG_FIGS)).toEqual("100");
})

test("neg_whole", () => {
    expect(toFriendlyString(d(-100,0),SIG_FIGS)).toEqual("-100");
})

test("pos_mixed_no_leading_fractional_zeros", () => {
    expect(toFriendlyString(d(1005,1),SIG_FIGS)).toEqual("100.5");
})

test("neg_mixed_no_leading_fractional_zeros", () => {
    expect(toFriendlyString(d(-1005,1),SIG_FIGS)).toEqual("-100.5");
})

test("pos_mixed_with_leading_fractional_zeros", () => {
    expect(toFriendlyString(d(10005,2),SIG_FIGS)).toEqual("100.05");
})

test("neg_mixed_with_leading_fractional_zeros", () => {
    expect(toFriendlyString(d(-10005,2),SIG_FIGS)).toEqual("-100.05");
})

test("pos_frac_with_no_leading_fractional_zeros", () => {
    expect(toFriendlyString(d(100,3),SIG_FIGS)).toEqual("0.1");
})

test("neg_frac_with_no_leading_fractional_zeros", () => {
    expect(toFriendlyString(d(-100,3),SIG_FIGS)).toEqual("-0.1");
})

test("pos_frac_with_leading_fractional_zeros", () => {
    expect(toFriendlyString(d(100,4),SIG_FIGS)).toEqual("0.01");
})

test("neg_frac_with_leading_fractional_zeros", () => {
    expect(toFriendlyString(d(-100,4),SIG_FIGS)).toEqual("-0.01");
})

test("pos_frac_with_many_leading_fractional_zeros", () => {
    expect(toFriendlyString(d(3,5),SIG_FIGS)).toEqual("0.0₄3");
})

test("neg_frac_with_many_leading_fractional_zeros", () => {
    expect(toFriendlyString(d(-3,5),SIG_FIGS)).toEqual("-0.0₄3");
})

test("pos_frac_with_multiple_leading_fractional_zeros", () => {
    expect(toFriendlyString(d(100,5),SIG_FIGS)).toEqual("0.0₂1");
})

test("neg_frac_with_multiple_leading_fractional_zeros", () => {
    expect(toFriendlyString(d(-100,5),SIG_FIGS)).toEqual("-0.0₂1");
})

function d(s : string|number, d : number) : DecimalizedAmount {
    return {
        tokenAmount : s.toString(),
        decimals : d
    }
}