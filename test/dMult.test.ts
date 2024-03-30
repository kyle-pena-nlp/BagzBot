import { DecimalizedAmount, dMult } from "../decimalized";
import { toFriendlyString } from "../decimalized/decimalized_amount";

test("dMult_1_times_1_A", () => {
    multTest(d(10,1), d(10,1), 1);
})

test("dMult_1_times_1_B", () => {
    multTest(d(1,0), d(1,0), 1);
})

test("dMult_diff_decimals", () => {
    multTest(d(3,1), d(5,0), 1.5);
})

test("dMult_zero_same_decimals", () => {
    multTest(d(3,1), d(0,1), 0);
})

test("dMult_zero_diff_decimals", () => {
    multTest(d(3,2), d(0,1), 0);
})

test("dMult_neg_neg_diff_decimals", () => {
    multTest(d(-3,2), d(-4,1), 0.012);
})

test("dMult_neg_pos_diff_decimals", () => {
    multTest(d(-3,2), d(4,1), -0.012);
})

function multTest(a : DecimalizedAmount, b : DecimalizedAmount, expectation : number) {
    const dResult = dMult(a,b);
    const dNumber = _toNumber(dResult);
    expect(dNumber).toBeCloseTo(expectation, 6);
}

function d(s : string|number, d : number) : DecimalizedAmount {
    return {
        tokenAmount : s.toString(),
        decimals : d
    }
}

export function _toNumber(d : DecimalizedAmount) : number {
    // this method isn't safe and is used for testing help
    const s = toFriendlyString(d,6, { useSubscripts: false });
    return parseFloat(s);
}