export function addAutoDoubleSlippageVerbiage(lines : string[]) {
    lines.push('<b>Automatically Double Slippage When Slippage Tolerance Is Exceeded On Sell?</b>')
    lines.push(':bullet: Choose whether you would like to automatically double the slippage percent every time the auto-sell fails due to slippage tolerance being exceeded.');
    lines.push(':bullet: If you do not choose to auto-double and the price drops very rapidly, you may not get out fast enough.');
    lines.push(':bullet: But if you choose to auto-double, you may lose out on profits if the token recovers or does not drop as rapidly.');
    lines.push(':bullet: Use your best judgment.');
}