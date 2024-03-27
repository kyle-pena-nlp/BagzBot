import { TokenAmount } from "@solana/web3.js";
import { Structural } from "../util";

// TODO: this was probably a bad idea.  Find a 3rd party library for arbitrary precision arithmetic instead.
// or... do everything at 9 decimal places.
// we could probably strategically swap out the dAdd/Sub/Mult/Div/Negate/Compare and friendly strings
// with something backed by an arbitrary precision library or something else.

export const MATH_DECIMAL_PLACES = 15;

/* See decimalized_math.ts for operations on this type */
export interface DecimalizedAmount {
    readonly [ key : string ] : Structural
    tokenAmount : string, // amount * 10^decimals.
    decimals : number
}

export function toKey(x : DecimalizedAmount) : string {
    return `${x.tokenAmount}~${x.decimals.toString()}`;
}

const subscriptDigits = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];

export function toFriendlyString(x : DecimalizedAmount, maxSigFigs : number, 
    useSubscripts : boolean = true, 
    addCommas : boolean = true) : string {
    const longDecimalRepr = moveDecimalInString(x.tokenAmount, -x.decimals);
    const numberParts = longDecimalRepr.split(".");
    if (numberParts.length == 1) {
        return numberParts[0];
    }
    else {
        let [wholePart,fractionalPart] = numberParts;
        let sign = '';
        if (wholePart.startsWith("-")) {
            wholePart = wholePart.substring(1);
            sign = '-';
        }
        let { zeros, rest } = splitIntoZerosAndRest(fractionalPart); // 0000444 -> { zeros: '0000', rest: '444' }
        // If there are multiple zeros between the decimal and some non-zero stuff to the right...
        if (useSubscripts && zeros.length > 1 && (wholePart == '0'||wholePart == '') && rest.length > 0) {
            // replace all those zeros with 0₇, for example
            let subscripts = '';
            for (const character of (zeros.length).toString()) {
                subscripts += subscriptDigits[parseInt(character,10)];
            }
            zeros = "0" + subscripts;
        }
        // If there are multiple zeros after the decimal but nothing to the right of them
        if (zeros.length > 1 && rest.length === 0) {
            // replace it with a single zero.  (Who cares about 5.000000? Just say '5.0')
            zeros = "0";
        }
        // If there are trailing zeros, like 5.0340000, replace it with 5.034
        rest = rest.replace(/0+$/, '');
        // If after all that, there are more places after the decimal (and the 0₇) than 'sigFigs'
        if (rest.length > maxSigFigs) {
            // Round sig figs - take one extra digit, decided by 10, round, and back to string.
            rest = Math.round(parseFloat(rest.substring(0, maxSigFigs + 1))/10).toString();
        }
        // Add commas to whole part of number.
        const localizedWholePart = addCommas ? 
            parseFloat(wholePart).toLocaleString() : 
            parseFloat(wholePart).toString();
        return sign + localizedWholePart + "." + zeros + rest;
    }
}

export function fromKey(key : string) : DecimalizedAmount {
    const stringParts = key.split("~");
    return {
        tokenAmount : stringParts[0],
        decimals : parseInt(stringParts[1], 10)
    };
}

/*
 * @warning This can be a lossy operation
*/
export function fromNumber(x : number, decimalPlaces? : number) : DecimalizedAmount {
    // handle numbers written like this: 3.56e-7 by converting them to 0.000000356
    let xString = convertToFixedFormatPrecisely(x);
    // split 7.04 into "7", "0", "456".  split 0.0004 into "0", "000", "4"
    let [sign,wholePart,zeros,decimalPart] = splitNumberStringIntoParts(xString);
    // remove trailing zeros from end of decimal part
    decimalPart = decimalPart.replace(/0+$/,'');
    // truncate to # of sig figs, if desired
    if (decimalPlaces) {
        decimalPart = decimalPart.substring(0, decimalPlaces);
    }
    // reconstitute the number without the decimal place
    let scaledNumber = wholePart + zeros + decimalPart;
    // remove any leading zeros
    if (scaledNumber !== '0') {
        scaledNumber = scaledNumber.replace(/^0+/, '');
    }
    scaledNumber = `${sign}${scaledNumber}`;
    // count the number of decimal to move to the left based on length of zeros and decimalPart
    const decimals = zeros.length + decimalPart.length;
    return {
        tokenAmount : scaledNumber,
        decimals : decimals
    };
}



export function fromTokenAmount(tokenAmount : TokenAmount) : DecimalizedAmount {
    return {
        tokenAmount: tokenAmount.amount,
        decimals: tokenAmount.decimals
    };
}

export function convertToFixedFormatPrecisely(x : number) : string {
    /* 
        ordinarily x.toFixed(20) would be enough but there is imprecision for even fractions like 0.1
        in the least sig parts.
        i.e.;  (0.1).toFixed(20) equals something like 0.100000000000000000055
    */

    const xString = x.toString().toLowerCase();
    const isInExponentialNotation = xString.indexOf("e") >= 0;
    if (!isInExponentialNotation) {
        return xString;
    }
    
    const expNumberParts = /^(?<whole>[^.e]+)(.(?<fraction>[^e]+))?e(?<exp>.*)$/.exec(xString)?.groups;
    const whole = expNumberParts?.whole!!;
    const fraction = expNumberParts?.fraction || '';
    const exp = expNumberParts?.exp!!;
    const unscaled = whole + fraction;
    const expNumber = parseFloat(exp);
    const fixed = moveDecimalInString(unscaled, expNumber - fraction.length);
    return fixed;
}

export function moveDecimalInString(xString : string, decimals : number) : string {
    
    // this method is not designed for numbers in exponential format.
    if (xString.toLowerCase().indexOf("e") >= 0) {
        throw Error("Exponential format not supported");
    }

    // normalize for negative numbers
    let sign = "";
    if (xString.startsWith("-")) {
        xString = xString.substring(1);
        sign = "-";
    }

    // determine current location of decimal in number.
    // if decimal DNE in string, consider it to be implicitly at the end of the string
    let decimalIndex = xString.indexOf(".");
    if (decimalIndex < 0) {
        decimalIndex = xString.length;
    }

    // get the entire number without the decimal place
    const unscaledNumber = xString.split(".").join("");

    // if it's nothing but zeros, return "0"
    if (unscaledNumber.match(/^0+$/)) {
        return `${sign}0`;
    }

    // move the position of the decimally virtually (by adjusting its index).
    decimalIndex = decimalIndex + decimals;

    let result = '';

    // reconstitute the number using the virtual decimal index
    if (decimalIndex <= 0) {
        result = "0." + "0".repeat(Math.abs(decimalIndex)) + unscaledNumber;
    }
    else if (decimalIndex >= unscaledNumber.length) {
        result = unscaledNumber + "0".repeat(decimalIndex - unscaledNumber.length);
    }
    else {
        const whole = unscaledNumber.substring(0, decimalIndex);
        const fractional = unscaledNumber.substring(decimalIndex);
        result = whole + "." + fractional;
    }

    // remove superfluous leading zeros 

    // 00.1 => 0.1
    result = result.replace(/^0+0\./,'0.');

    // 0015 => 15
    result = result.replace(/^0+([1-9][0-9]*)/,'$1');

    // put the sign back in place
    result = `${sign}${result}`;
    return result;
}

function splitNumberStringIntoParts(xString : string) : [string,string,string,string] {
    let sign = '';
    if (xString.startsWith("-")) {
        sign = '-';
        xString = xString.substring(1);
    }
    const dotIdx = xString.indexOf(".");
    if (dotIdx < 0) {
        return [sign,xString,'',''];
    }
    else {
        const wholePart = xString.substring(0, dotIdx);
        const fractionalPart = xString.substring(dotIdx+1);
        let { zeros, rest } = splitIntoZerosAndRest(fractionalPart);
        return [sign,wholePart, zeros, rest];
    }
}

function splitIntoZerosAndRest(s : string) {
    return /^(?<zeros>0*)(?<rest>.*)$/.exec(s)?.groups!!;
}