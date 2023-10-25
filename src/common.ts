export function replaceBlanks(s: string): string {
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

export function parseIntSafe(str: string, radix: 8 | 10 | 16): number {
    let allowed;
    switch (radix) {
        case 8:     allowed = /^[0-7]+$/; break;
        case 10:    allowed = /^[0-9]+$/; break;
        case 16:    allowed = /^[0-9A-Fa-f]+$/; break;
    }

    if (!str.match(allowed)) {
        throw Error(`Invalid symbols in number for radix ${radix}`);
    }

    return Number.parseInt(str, radix);
}

export function to7BitAscii(chr: string, markParity: boolean): number {
    const code = chr.codePointAt(0);
    if (code === undefined || code >= 0x80) {
        throw Error("Invalid 7-bit ASCII");
    }
    return code | (markParity ? 0o200 : 0);
}
