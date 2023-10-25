export function replaceControlChars(s: string): string {
    return s
        .replaceAll("\t", "<TAB>")
        .replaceAll("\r", "<CR>")
        .replaceAll("\n", "<LF>")
        .replaceAll("\f", "<FF>");
}

export function asciiCharTo6Bit(chr: string): number {
    return chr.charCodeAt(0) & 0o77;
}

export function dec6BitToAscii(chr: number): string {
    let ascii = chr;
    if (chr > 0 && chr <= 0o37) {
        ascii |= 0o100;
    }
    return String.fromCharCode(ascii);
}

export function calcPageNum(loc: number): number {
    return (loc >> 7) & 31;
}

export function calcFieldNum(loc: number): number {
    return (loc >> 12) & 7;
}

export function firstAddrInPage(fieldNum: number, pageNum: number): number {
    return (fieldNum * 0o10000) | (pageNum * 0o200);
}

export function numToOctal(num: number, width: number): string {
    return num.toString(8).padStart(width, "0");
}
