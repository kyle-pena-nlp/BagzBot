import { DecimalizedAmount, fromNumber } from "../decimalized";

test('fromNumber_zero', () => {
    testPosAndNegOf(0, { tokenAmount: "0", decimals: 0 });
});

test('fromNumber_wholeNumber', () => {
    testPosAndNegOf(15, { tokenAmount: "15", decimals: 0 });
});

test('fromNumber_wholeNumber_trailingZeros', () => {
    testPosAndNegOf(100, { tokenAmount: "100", decimals: 0 });
});

test('fromNumber_mixedNumber_trailingZeros', () => {
    testPosAndNegOf(1.50, { tokenAmount: "15", decimals: 1 });
});

test('fromNumber_mixedNumber_fractionalLeadingZeros', () => {
    testPosAndNegOf(1.005, { tokenAmount: "1005", decimals: 3 });
});



test('fromNumber_fractionalNumber_noLeadingZeros', () => {
    testPosAndNegOf(0.5, { tokenAmount: "5", decimals: 1 });
});

test('fromNumber_fractionalNumber_leadingZeros', () => {
    testPosAndNegOf(0.0005, { tokenAmount: "5", decimals: 4 });
});

test('fromNumber_expWholeNumber', () => {
    testPosAndNegOf(1e2, { tokenAmount: "100", decimals: 0 });
});

test('fromNumber_expWholeNumber_trailingZeros', () => {
    testPosAndNegOf(10e2, { tokenAmount: "1000", decimals: 0 });
});

test('fromNumber_expMixedNumber_trailingZeros', () => {
    testPosAndNegOf(1.20e2, { tokenAmount: "120", decimals: 0 });
});

test('fromNumber_expMixedNumber_fractionalLeadingZeros', () => {
    testPosAndNegOf(1.02e2, { tokenAmount: "102", decimals: 0 });
});

test('fromNumber_expFractionalNumber_noLeadingZeros', () => {
    testPosAndNegOf(0.12e2, { tokenAmount: "12", decimals: 0 });
});

test('fromNumber_expFractionalNumber_leadingZeros', () => {
    testPosAndNegOf(0.012e3, { tokenAmount: "12", decimals: 0 });
});

test('fromNumber_expWholeNumber_negExp', () => {
    testPosAndNegOf(1e-5, { tokenAmount: "1", decimals: 5 });
});

test('fromNumber_expMixedNumber_negExp', () => {
    testPosAndNegOf(1.3e-5, { tokenAmount: "13", decimals: 6 });
});

test('fromNumber_expMixedNumber_reallyBig', () => {
    testPosAndNegOf(1.3e19, { tokenAmount: "13000000000000000000", decimals: 0 });
});

test('fromNumber_expMixedNumber_reallySmall', () => {
    testPosAndNegOf(1.3e-19, { tokenAmount: "13", decimals: 20 });
});


function testPosAndNegOf(x : number, expectation : DecimalizedAmount) {

    const result = fromNumber(x);
    expect(result).toEqual(expectation);

    if (x !== 0) {
        const negX = -x;
        const negResult = fromNumber(negX);
        const negExpectation = {
            tokenAmount : "-" + expectation.tokenAmount,
            decimals: expectation.decimals
        };
        expect(negResult).toEqual(negExpectation);
    }
}