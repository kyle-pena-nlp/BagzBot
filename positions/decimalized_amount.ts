/* See decimalized_math.ts for operations on this type */
export interface DecimalizedAmount {
    tokenAmount : string, // amount * 10^decimals.  String because maybe too big for JS?
    decimals : number
}

export function toKey(x : DecimalizedAmount) : string {
    return `${x.tokenAmount}~${x.decimals.toString()}`;
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

function splitNumberStringIntoParts(xString : string) : [string,string] {
    const dotIdx = xString.indexOf(".");
    if (dotIdx >= 0) {
        return [xString.substring(0, dotIdx), xString.substring(dotIdx+1)];
    }
    else {
        return [xString,''];
    }
}