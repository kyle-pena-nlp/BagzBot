import { TokenAmount } from "@solana/web3.js";
import { tryParseFloat } from "../util/numbers";

export const MATH_DECIMAL_PLACES = 6;

/* See decimalized_math.ts for operations on this type */
export interface DecimalizedAmount {
    tokenAmount : string, // amount * 10^decimals.  String because maybe too big for JS?
    decimals : number
}

export function toKey(x : DecimalizedAmount) : string {
    return `${x.tokenAmount}~${x.decimals.toString()}`;
}

const subscriptDigits = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];

export function toFriendlyString(x : DecimalizedAmount, maxSigFigs : number) : string {
    const longDecimalRepr = moveDecimalLeftInString(x.tokenAmount, x.decimals);
    const numberParts = longDecimalRepr.split(".");
    if (numberParts.length == 1) {
        return numberParts[0];
    }
    else {
        const [wholePart,fractionalPart] = numberParts;
        let { zeros, rest } = /^(?<zeros>0*)(?<rest>.*)$/.exec(fractionalPart)?.groups!!;
        // If there are multiple zeros between the decimal and some non-zero stuff to the right...
        if (zeros.length > 1 && (wholePart == '0'||wholePart == '') && rest.length > 0) {
            // replace all those zeros with 0₇, for example
            zeros = "0" + subscriptDigits[zeros.length];
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
        const localizedWholePart = parseFloat(wholePart).toLocaleString();
        return localizedWholePart + "." + zeros + rest;
    }
}

export function fromKey(key : string) : DecimalizedAmount {
    const stringParts = key.split("~");
    return {
        tokenAmount : stringParts[0],
        decimals : parseInt(stringParts[1], 10)
    }
}

/*
 * @warning This can be a lossy operation
*/
export function fromNumber(x : number, decimalPlaces? : number) : DecimalizedAmount {
    let xString = x.toString(10);
    let [wholePart,decimalPart] = splitNumberStringIntoParts(xString);
    if (decimalPlaces) {
        decimalPart = decimalPart.substring(0, decimalPlaces);
    }
    const scaledNumber = wholePart + decimalPart;
    const decimals = decimalPart.length;
    return {
        tokenAmount : scaledNumber,
        decimals : decimals
    };
}

export function fromTokenAmount(tokenAmount : TokenAmount|null|undefined) : DecimalizedAmount|null {
    if (tokenAmount == null) {
        return null;
    }
    return {
        tokenAmount: tokenAmount.amount,
        decimals: tokenAmount.decimals
    }
}

export function moveDecimalLeftInString(tokenAmount : string, decimals : number) : string {
    if (decimals >= tokenAmount.length) {
        const leadingZeros = decimals - tokenAmount.length;
        return "0." + ("0".repeat(leadingZeros)) + tokenAmount;
    }
    else {
        const beforeDecimalPoint = tokenAmount.substring(0, tokenAmount.length - decimals);
        const afterDecimalPoint = tokenAmount.substring(tokenAmount.length - decimals);
        return beforeDecimalPoint + "." + afterDecimalPoint;
    }
}

function splitNumberStringIntoParts(xString : string) : [string,string] {
    const dotIdx = xString.indexOf(".");
    if (dotIdx >= 0) {
        return [xString.substring(0, dotIdx), xString.substring(dotIdx+1)];
    }
    else {
        return [xString,''];
    }
}