import { assertNever } from "./enums";

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
export class FormattedTable {
    format : number[];
    lineFormatting : 'bulleted'|'none'
    header ?: string[];
    columnSep : string;
    lines : string[];  
    constructor(format : number[], lineFormatting : 'bulleted'|'none', header ?: string[], columnSep = " | ") {
        this.format = format;
        this.lineFormatting = lineFormatting;
        this.header = header;
        this.lines = [];
        this.columnSep = columnSep;
    }
    addLine(...items : string[]) {
        this.lines.push(this.makeLine(items));
    }
    private makeLine(items : string[]) : string {
        const lineCells : string[] = [];
        items.forEach((item,index) => {
            const padLength = this.format[index];
            const cell = padLength != null ? `<code>${padRight(item, padLength)}</code>` : item;
            lineCells.push(cell);
        });
        const line = lineCells.join(this.columnSep);
        return this.addLineFormatting(line);
    }
    private build() {
        if (this.hasHeader()) {
            this.lines.unshift(this.headerLine());
        }
    }
    private render() : string {
        this.build();
        return this.lines.join("\r\n");
    }
    appendTo(lines : string[]) {
        this.build();
        lines.push(...this.lines);
    }
    private hasHeader() :  this is this & { header :  string[] } {
        return this.header != null;
    }
    private headerLine(this : this & { header : string[] }) : string {
        return this.makeLine(this.header);
    }
    private addLineFormatting(line : string) : string {
        switch(this.lineFormatting) {
            case 'bulleted':
                return `:bullet: ${line}`;
            case 'none':
                return line;
            default:
                assertNever(this.lineFormatting);
        }
    }
}