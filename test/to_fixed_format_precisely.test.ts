import { convertToFixedFormatPrecisely } from "../decimalized/decimalized_amount";

test('toFixedFormatPrecisely_wholeNumberTrailingZeros', () => {
    testToFixedFormatPrecisely(100, "100");
})

test('toFixedFormatPrecisely_fractionalNumberLeadingZeros', () => {
    testToFixedFormatPrecisely(0.0001, "0.0001");
})

test('toFixedFormatPrecisely_0', () => {
    testToFixedFormatPrecisely(0, "0");
})

test('toFixedFormatPrecisely_1', () => {
    testToFixedFormatPrecisely(1, "1");
})

test('toFixedFormatPrecisely_whole_zeroexp', () => {
    testToFixedFormatPrecisely(12e0, "12");
})

test('toFixedFormatPrecisely_whole_pos1exp', () => {
    testToFixedFormatPrecisely(12e1, "120");
})

test('toFixedFormatPrecisely_whole_neg2exp', () => {
    testToFixedFormatPrecisely(12e-2, "0.12");
})

test('toFixedFormatPrecisely_mixed', () => {
    testToFixedFormatPrecisely(1.2, "1.2");
})

test('toFixedFormatPrecisely_mixed_zeroexp', () => {
    testToFixedFormatPrecisely(1.2e0, "1.2");
})

test('toFixedFormatPrecisely_mixed_pos1exp', () => {
    testToFixedFormatPrecisely(1.2e1, "12");
})

test('toFixedFormatPrecisely_mixed_pos2exp', () => {
    testToFixedFormatPrecisely(1.2e2, "120");
})

test('toFixedFormatPrecisely_mixed_neg1exp', () => {
    testToFixedFormatPrecisely(1.2e-1, "0.12");
})

test('toFixedFormatPrecisely_mixed_neg2exp', () => {
    testToFixedFormatPrecisely(1.2e-2, "0.012");
})

test('toFixedFormatPrecisely_fractional_zeroexp', () => {
    testToFixedFormatPrecisely(0.12e0, "0.12");
})

test('toFixedFormatPrecisely_fractional_1exp', () => {
    testToFixedFormatPrecisely(0.12e1, "1.2");
})

test('toFixedFormatPrecisely_fractional_2exp', () => {
    testToFixedFormatPrecisely(0.12e2, "12");
})

test('toFixedFormatPrecisely_fractional_neg1exp', () => {
    testToFixedFormatPrecisely(0.12e-1, "0.012");
})

test('toFixedFormatPrecisely_fractional_neg2exp', () => {
    testToFixedFormatPrecisely(0.12e-2, "0.0012");
})

test('toFixedFormatPrecisely_fractionalLeadZeros', () => {
    testToFixedFormatPrecisely(0.012, "0.012");
})

test('toFixedFormatPrecisely_fractionalLeadZeros_zeroexp', () => {
    testToFixedFormatPrecisely(0.012e0, "0.012");
})

test('toFixedFormatPrecisely_fractionalLeadZeros_1exp', () => {
    testToFixedFormatPrecisely(0.012e1, "0.12");
})

test('toFixedFormatPrecisely_fractionalLeadZeros_2exp', () => {
    testToFixedFormatPrecisely(0.012e2, "1.2");
})

test('toFixedFormatPrecisely_fractionalLeadZeros_neg1exp', () => {
    testToFixedFormatPrecisely(0.012e-1, "0.0012");
})

test('toFixedFormatPrecisely_fractionalLeadZeros_neg2exp', () => {
    testToFixedFormatPrecisely(0.012e-2, "0.00012");
})


test('toFixedFormatPrecisely1.01e0', () => {
    testToFixedFormatPrecisely(1.01e0, "1.01");
})

test('toFixedFormatPrecisely_mixedNumber_negExp', () => {
    testToFixedFormatPrecisely(1.3e-2, "0.013");
})

test('toFixedFormatPrecisely_mixedNumber_negExp', () => {
    testToFixedFormatPrecisely(1.3e-2, "0.013");
})

test('toFixedFormatPrecisely_mixedNumberFracPartLeadingZeros_negExp', () => {
    testToFixedFormatPrecisely(1.03e-2, "0.0103");
})

test('toFixedFormatPrecisely_mixedNumberFracPartLeadingZeros_posExp', () => {
    testToFixedFormatPrecisely(1.03e2, "103");
})

test('toFixedFormatPrecisely_mixedNumberTrailingZeros_posExp', () => {
    testToFixedFormatPrecisely(1.30e2, "130");
})

test('toFixedFormatPrecisely_mixedNumberTrailingZeros_negExp', () => {
    testToFixedFormatPrecisely(1.30e-2, "0.013");
})

test('toFixedFormatPrecisely_mixed_reallyBig', () => {
    testToFixedFormatPrecisely(1.30e18, "1300000000000000000");
})

test('toFixedFormatPrecisely_mixed_reallySmall', () => {
    testToFixedFormatPrecisely(1.30e-18, "0.0000000000000000013");
})



function testToFixedFormatPrecisely(x : number, expectation : string) {
    const result = convertToFixedFormatPrecisely(x);
    expect(result).toEqual(expectation);

    if (x !== 0) {
        const negX = -x;
        const negResult = convertToFixedFormatPrecisely(negX);
        const negExpectation = "-" + expectation;
        expect(negResult).toEqual(negExpectation);
    }
}