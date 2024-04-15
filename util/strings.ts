export function padRight(s : string, length : number, padChar : string = " ") : string  {
    if (padChar.length !== 1) {
        throw new Error("padChar must be exactly one character");
    }
    if (s.length < length) {
        return s + " ".repeat(length - s.length);
    }
    else {
        return s.slice(0, length);
    }
}

// Renders tables with right-padded cells in TG
export class Table {
    format : number[];
    header ?: string[];
    columnSep : string;
    lines : string[];  
    constructor(format : number[], header ?: string[], columnSep = "") {
        this.format = format;
        this.header = header;
        this.lines = [];
        this.columnSep = columnSep;
    }
    addLine(items : string[]) {
        this.lines.push(this.makeLine(items));
    }
    private makeLine(items : string[]) : string {
        const lineCells : string[] = [];
        const paddedItems = items.slice(0,this.format.length);
        items.forEach((item,index) => {
            const padLength = this.format[index];
            const cell = padLength != null ? `<code>${padRight(item, padLength)}</code>` : item;
            lineCells.push(cell);
        });
        return lineCells.join(this.columnSep);
    }
    render() : string {
        if (this.hasHeader()) {
            this.lines.unshift(this.headerLine());
        }
        return this.lines.join("\r\n");
    }
    private hasHeader() :  this is this & { header :  string[] } {
        return this.header != null;
    }
    private headerLine(this : this & { header : string[] }) : string {
        return this.makeLine(this.header);
    }
}