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

// inputs must be integral and mantissa must be positive!
// algorithm from macro8x.c, Gary A. Messenbrink
export function toDECFloat(negative: boolean, mantissa: number, exponent: number): [number, number] {
    const shift = 3; // increase internal precision by this
    let m = mantissa;
    let e = exponent;

    while ((m != 0) && (m % 10 == 0)) {
        m = Math.trunc(m / 10);
        e++;
    }

    let [outM, outE] = normalize(m << shift, 23 + shift, 23 + shift);
    while (e != 0) {
        if (e < 0) {
            outM = Math.trunc(outM / 10);
            e++;
        } else {
            outM = Math.trunc(outM * 10);
            e--;
        }
        [outM, outE] = normalize(outM, outE, 23 + shift);
    }
    outM >>= shift;
    outE -= shift;

    if (negative) {
        outM = -outM & 0o77777777;
    }

    return [outM, outE];
}

function normalize(mantissa: number, exponent: number, bits: number): [number, number] {
    const upMask = (1 << bits) - 1;
    const loMask = (1 << (bits - 1)) - 1;

    if (mantissa == 0) {
        return [mantissa, 0];
    }

    if ((mantissa & ~upMask) == 0) {
        while ((mantissa & ~loMask) == 0) {
            mantissa <<= 1;
            exponent--;
        }
    } else {
        while ((mantissa & ~upMask) != 0) {
            mantissa >>= 1;
            exponent++;
        }
    }

    return [mantissa, exponent];
}
