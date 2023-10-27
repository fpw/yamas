export const ExponentBits = 12;
export const ExponentSignMask = (1 << 11);
export const MantissaBits = 24;
export const MantissaSignMask = (1 << 23);

// returns unsigned values
export function toDECFloat(input: number): [number, number, number] {
    const [m, e] = frexp(input);
    const outM = Math.round(ldexp(m, MantissaBits - 1)); // MSB is for sign
    return [e & 0o7777, (outM >> 12) & 0o7777, outM & 0o7777];
}

// pass unsigned values
export function fromDecFloat(e: number, m1: number, m2: number) {
    let sgnM = 1;
    let sgnE = 1;

    let m = (m1 << 12) | m2;

    // remove sign bit from exponent
    if (e & ExponentSignMask) {
        e = (1 << (ExponentBits - 1)) - (e & ~ExponentSignMask);
        sgnE = -1;
    }

    // remove sign it from mantissa
    if (m & MantissaSignMask) {
        m = (1 << (MantissaBits - 1)) - (m & ~MantissaSignMask);
        sgnM = -1;
    }

    if (m == 0 && e == 0) {
        return 0;
    }

    return sgnM * ldexp(m, sgnE * e - (MantissaBits - 1));
}

// from https://blog.codefrau.net/2014/08/deconstructing-floats-frexp-and-ldexp.html
export function frexp(value: number): [number, number] {
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
export function ldexp(mantissa: number, exponent: number): number {
    const steps = Math.min(3, Math.ceil(Math.abs(exponent) / 1023));
    let result = mantissa;
    for (let i = 0; i < steps; i++) {
        result *= Math.pow(2, Math.floor((exponent + i) / steps));
    }
    return result;
}
