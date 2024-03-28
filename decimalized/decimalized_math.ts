import { DecimalizedAmount, dZero, moveDecimalInString } from "./decimalized_amount";

export function dAdd(a : DecimalizedAmount, b : DecimalizedAmount) : DecimalizedAmount {
    const decimals = Math.max(a.decimals, b.decimals);
    a = convertToLargerDecimals(a, decimals);
    b = convertToLargerDecimals(b, decimals);
    return {
        tokenAmount : (BigInt(a.tokenAmount) + BigInt(b.tokenAmount)).toString(),
        decimals: decimals
    };
}

export function dSub(a : DecimalizedAmount, b : DecimalizedAmount) : DecimalizedAmount {
    let decimals = Math.max(a.decimals, b.decimals);
    a = convertToLargerDecimals(a, decimals);
    b = convertToLargerDecimals(b, decimals);
    const biDiff = (BigInt(a.tokenAmount) - BigInt(b.tokenAmount));
    if (biDiff == 0n) {
        decimals = 0;
    }
    return {
        tokenAmount : biDiff.toString(),
        decimals: decimals
    };
}

export function dNegate(x : DecimalizedAmount) : DecimalizedAmount {
    return dSub({ tokenAmount: "0", decimals : x.decimals}, x);
}

export function dMult(a : DecimalizedAmount, b : DecimalizedAmount) : DecimalizedAmount {
    const decimals = Math.max(a.decimals, b.decimals);
    a = convertToLargerDecimals(a, decimals);
    b = convertToLargerDecimals(b, decimals);
    return {
        tokenAmount : (BigInt(a.tokenAmount) * BigInt(b.tokenAmount)).toString(),
        decimals: 2 * decimals
    };
}

/*
 * @warning This can be a lossy operation
*/
export function dDiv(a : DecimalizedAmount, b : DecimalizedAmount, decimalPlaces : number) : DecimalizedAmount|undefined {
    const decimals = Math.max(a.decimals, b.decimals);
    a = convertToLargerDecimals(a, decimals);
    b = convertToLargerDecimals(b, decimals);
    if (dCompare(b, dZero()) === 0) {
        return;
    }
    const decimalPlaceMultiplier = BigInt("1" + ("0".repeat(decimalPlaces)));
    const scaledResultBI = ((BigInt(a.tokenAmount) * decimalPlaceMultiplier) / BigInt(b.tokenAmount));
    return {
        tokenAmount: scaledResultBI.toString(),
        decimals : decimalPlaces
    };
}

export function percentOf(price : DecimalizedAmount, peakPrice : DecimalizedAmount) : number {
    const fraction = dDiv(price, peakPrice, 6);
    if (fraction == null) {
        return 0.0;
    }
    const number = dAsNumber(fraction);
    return number;
}

export function dMoveDecimalLeft(a : DecimalizedAmount, places : number) {
    if (places < 0) {
        throw new Error("Only move to left positive # of places.");
    }
    return {
        tokenAmount: a.tokenAmount,
        decimals: a.decimals + places
    };
}

export function dCompare(a : DecimalizedAmount, b : DecimalizedAmount) : number {
    const decimals = Math.max(a.decimals, b.decimals);
    a = convertToLargerDecimals(a, decimals);
    b = convertToLargerDecimals(b, decimals);
    const aBI = BigInt(a.tokenAmount);
    const bBI = BigInt(b.tokenAmount);
    if (aBI < bBI) {
        return -1;
    }
    else if (aBI > bBI) {
        return 1;
    }
    else {
        return 0;
    }
}

function convertToLargerDecimals(a : DecimalizedAmount, d : number) {
    if (d < a.decimals) {
        throw new Error("Cannot convert to a smaller decimal using this method.");
    }
    const numDecimals = d - a.decimals;
    const multiplier = BigInt("1" + ("0".repeat(numDecimals)));
    return {
        tokenAmount: (BigInt(a.tokenAmount) * multiplier).toString(),
        decimals : d
    };
}

function dAsNumber(a : DecimalizedAmount) : number {
    const stringAmount = moveDecimalInString(a.tokenAmount, -a.decimals);
    return parseFloat(stringAmount);
}

export const ZERO : DecimalizedAmount = { tokenAmount: "0", decimals: 0 }; 