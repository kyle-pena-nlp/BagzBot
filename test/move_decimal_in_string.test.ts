
import { moveDecimalInString } from "../decimalized/decimalized_amount";

test('moveDecimalInString_wholeNumber_noPlaces', () => {
    testMoveDecimalInString("1", 0, "1");
});

test('moveDecimalInString_wholeNumber_negPlaces', () => {
    testMoveDecimalInString("1", -1, "0.1");
});

test('moveDecimalInString_wholeNumber_multNegPlaces', () => {
    testMoveDecimalInString("1", -2, "0.01");
});

test('moveDecimalInString_wholeNumber_posPlaces', () => {
    testMoveDecimalInString("1", 1, "10");
});

test('moveDecimalInString_wholeNumber_multPosPlaces', () => {
    testMoveDecimalInString("1", 1, "10");
});

test('moveDecimalInString_mixedNumber_noPlaces', () => {
    testMoveDecimalInString("1.1", 0, "1.1");
});

test('moveDecimalInString_mixedNumber_negPlaces', () => {
    testMoveDecimalInString("1.1", -1, "0.11");
});

test('moveDecimalInString_mixedNumber_multNegPlaces', () => {
    testMoveDecimalInString("1.1", -2, "0.011");
});

test('moveDecimalInString_mixedNumber_posPlaces', () => {
    testMoveDecimalInString("1.1", 1, "11");
});

test('moveDecimalInString_mixedNumber_multPosPlaces', () => {
    testMoveDecimalInString("1.1", 2, "110");
});

test('moveDecimalInString_fraction_noPlaces', () => {
    testMoveDecimalInString("0.1", 0, "0.1");
});

test('moveDecimalInString_fraction_negPlaces', () => {
    testMoveDecimalInString("0.1", -1, "0.01");
});

test('moveDecimalInString_fraction_multNegPlaces', () => {
    testMoveDecimalInString("0.1", -2, "0.001");
});

test('moveDecimalInString_fraction_posPlaces', () => {
    testMoveDecimalInString("0.1", 1, "1");
});

test('moveDecimalInString_fraction_multPosPlaces', () => {
    testMoveDecimalInString("0.1", 2, "10");
});

test('moveDecimalInString_zero_noPlaces', () => {
    testMoveDecimalInString("0", 0, "0");
});

test('moveDecimalInString_zero_negPlaces', () => {
    testMoveDecimalInString("0", -1, "0");
});

test('moveDecimalInString_zero_multNegPlaces', () => {
    testMoveDecimalInString("0", -2, "0");
});

test('moveDecimalInString_zero_posPlaces', () => {
    testMoveDecimalInString("0", 1, "0");
});

test('moveDecimalInString_zero_multPosPlaces', () => {
    testMoveDecimalInString("0", 2, "0");
})

test('moveDecimalInString_zeroptzero_noPlaces', () => {
    testMoveDecimalInString("0.0", 0, "0");
});

test('moveDecimalInString_zeroptzero_posPlaces', () => {
    testMoveDecimalInString("0.0", 1, "0");
});

test('moveDecimalInString_zeroptzero_multPosPlaces', () => {
    testMoveDecimalInString("0.0", 2, "0");
});

test('moveDecimalInString_zeroptzero_negPlaces', () => {
    testMoveDecimalInString("0.0", -1, "0");
});

test('moveDecimalInString_zeroptzero_multNegPlaces', () => {
    testMoveDecimalInString("0.0", -2, "0");
});

/*



test('fromNumber1', () => {
    testFromNumberEq10Dec(1, {
        tokenAmount: "1",
        decimals: 0
    });
});

test('fromNumber0_1', () => {
    testFromNumberEq10Dec(0.1, {
        tokenAmount: "1",
        decimals: 1
    });
});

test('fromNumber0_01', () => {
    testFromNumberEq10Dec(0.01, {
        tokenAmount: "1",
        decimals: 2
    });
});

test('fromNumber1e_neg_19', () => {
    testFromNumberEq10Dec(1e-19, {
        tokenAmount: "1",
        decimals: 19
    });
});

function testFromNumberEq10Dec(x : number, expectation : DecimalizedAmount) {
    const result = fromNumber(x, 10);
    expect(result).toEqual(expectation);
}




}*/

function testMoveDecimalInString(x : string, d : number, expectation : string) {

    if (x.startsWith("-")) {
        throw new Error("Positive numbers for testing - negative case tested automatically");
    }

    const result = moveDecimalInString(x, d);
    expect(result).toEqual(expectation);

    const negInput = "-" + x;
    const negResult = moveDecimalInString(negInput, d);
    expect(negResult).toEqual("-" + expectation);
}