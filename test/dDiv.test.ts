import { DecimalizedAmount, dDiv, toFriendlyString } from "../decimalized";

test("div_same_number_eq_1", () => {
    divTest(d(5,2), d(5,2), 1);
    divTest(d(5,1), d(5,1), 1);
    divTest(d(5,0), d(5,0), 1);
    divTest(d(-5,2), d(-5,2), 1);
    divTest(d(-5,1), d(-5,1), 1);
    divTest(d(-5,0), d(-5,0), 1);
});


test("div_by_power_10", () => {
    divTest(d(500,0), d(1000,0), 0.5);
    divTest(d(500,0), d(100,0), 5);
    divTest(d(500,0), d(10,0), 50);
    divTest(d(500,0), d(1,1), 5000);
    divTest(d(500,0), d(1,2), 50000);
    divTest(d(500,0), d(1,3), 500000);
    divTest(d(500,0), d(1,0), 500);
    divTest(d(500,0), d(1,1), 5000);
    divTest(d(500,0), d(1,2), 50000);
    divTest(d(500,0), d(1,3), 500000);
});

test("div_neg_pos_eq_neg", () => {
    divTest(d(-5,0), d(1,0), -5);
})

test("div_pos_neg_eq_neg", () => {
    divTest(d(5,0), d(-1,0), -5);
})

test("div_neg_neg_eq_pos", () => {
    divTest(d(-5,0), d(-1,0), 5);
})

test("div_by_reallySmall", () => {
    divTest(d(5,0), d(1,15), 5e15);
})

test("div_reallySmall_by_reallySmall", () => {
    divTest(d(5,15), d(1,15), 5);
})

test("div_reallySmall_by_something", () => {
    divTest(d(5,15), d(5,0), 1e-15, 20);
})

test("div_by_reallyBig", () => {
    divTest(d(5,0), d(1e18,0), 5e-18, 20);
})


function divTest(a : DecimalizedAmount, b : DecimalizedAmount, expectation : number, places : number = 9) {
    const dResult = dDiv(a,b,places);
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
    const s = toFriendlyString(d,6,false,false);
    return parseFloat(s);
}