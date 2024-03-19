import { DecimalizedAmount, dCompare } from "../decimalized";

test("10_gt_9", () => {
    testCompare(d(10,0), '>', d(9,0));
})

test("9_lt_10", () => {
    testCompare(d(9,0), '<', d(10,0));
})

test(".10_gt_.9", () => {
    testCompare(d(10,1), '>', d(9,1));
})

test(".9_lt_.10", () => {
    testCompare(d(9,1), '<', d(10,1));
})

test(".10_gt_.9", () => {
    testCompare(d(10,1), '>', d(9,1));
})

test(".01_lt_.9", () => {
    testCompare(d(10,2), '<', d(9,1));
})

test(".09_lt_.9", () => {
    testCompare(d(9,2), '<', d(9,1));
})

test("0_eq_0_V1", () => {
    testCompare(d(0,0), '=', d(0,0));
})

test("0_eq_0_v2", () => {
    testCompare(d(0,0), '=', d(0,1));
})

test("10_eq_10", () => {
    testCompare(d(1,1), '=', d(1,1));
})

test("-10_eq_-10", () => {
    testCompare(d(-10,0), '=', d(-10,0));
})

test("-.10_eq_-.10", () => {
    testCompare(d(-1,1), '=', d(-1,1));
})


function testCompare(x : DecimalizedAmount, op : '>'|'<'|'=', y : DecimalizedAmount) {
    const result = dCompare(x,y);
    const expectation = { '>': 1, '<': -1, '=': 0 }[op];
    expect(result).toEqual(expectation);
}

function d(s : string|number, d : number) : DecimalizedAmount {
    return {
        tokenAmount : s.toString(),
        decimals : d
    }
}
