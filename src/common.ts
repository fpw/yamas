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

export function calcPageNum(loc: number): number {
    return (loc >> 7) & 31;
}

export function firstAddrInPage(pageNum: number): number {
    return pageNum * 0o200;
}

export function to7BitAscii(chr: string, markParity: boolean): number {
    const code = chr.codePointAt(0);
    if (code === undefined || code >= 0x80) {
        throw Error("Invalid 7-bit ASCII");
    }
    return code | (markParity ? 0o200 : 0);
}

export function toDECFloat(input: number): [number, number, number] {
    const [m, e] = frexp(input);
    const outM = Math.round(ldexp(m, 23));
    return [e & 0o7777, (outM >> 12) & 0o7777, outM & 0o7777];
}

export function fromDecFloat(e: number, m1: number, m2: number) {
    let sgnM = 1;
    let sgnE = 1;

    if (e & 0o4000) {
        e = (1 << 11) - (e & ~0o4000);
        sgnE = -1;
    }

    let m = (m1 << 12) | m2;
    if (m & 0o40000000) {
        m = (1 << 23) - (m & ~0o40000000);
        sgnM = -1;
    }

    if (m == 0 && e == 0) {
        return 0;
    }

    return sgnM * ldexp(m, sgnE * e - 23);
}

// from https://blog.codefrau.net/2014/08/deconstructing-floats-frexp-and-ldexp.html
function frexp(value: number): [number, number] {
    if (value == 0) {
        return [value, 0];
    }

    const data = new DataView(new ArrayBuffer(8));
    data.setFloat64(0, value);
    let bits = (data.getUint32(0) >>> 20) & 0x7FF;
    if (bits === 0) { // denormal
        data.setFloat64(0, value * Math.pow(2, 64));  // exp + 64
        bits = ((data.getUint32(0) >>> 20) & 0x7FF) - 64;
    }
    const exponent = bits - 1022;
    const mantissa = ldexp(value, -exponent);
    return [mantissa, exponent];
}

// from https://blog.codefrau.net/2014/08/deconstructing-floats-frexp-and-ldexp.html
function ldexp(mantissa: number, exponent: number): number {
    const steps = Math.min(3, Math.ceil(Math.abs(exponent) / 1023));
    let result = mantissa;
    for (let i = 0; i < steps; i++) {
        result *= Math.pow(2, Math.floor((exponent + i) / steps));
    }
    return result;
}
