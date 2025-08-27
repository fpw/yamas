/* eslint-disable max-lines-per-function */
/*
 *   Yamas - Yet Another Macro Assembler (for the PDP-8)
 *   Copyright (C) 2023 Folke Will <folko@solhost.org>
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Affero General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU Affero General Public License for more details.
 *
 *   You should have received a copy of the GNU Affero General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * PDP-8 Floating Point Format (24-bit mantissa variant)
 *
 * A DEC floating point number is represented using three 12-bit words:
 *   - The first word is the 12-bit exponent (two's complement)
 *   - The second and third words form the 24-bit mantissa (two's complement)
 *   - The mantissa is normalized to start with 0.1..., so there are only 23 significant digits
 *     since it always starts with an explicit one. It represents a decimal part in [0.5, 1).
 *
 * Layout:
 *   [ exponent (12 bits) | mantissa high (12 bits) | mantissa low (12 bits) ]
 *
 */

// Regex to parse scientific notation: optional sign, digits with decimal point, optional exponent
const FloatRegex = /^([-+])?(\d+\.\d*|\d*\.\d+|\d+)(e([-+]?)(\d+))?$/i;

// Intermediate representation: parsed components of scientific notation string
// Example: "-123.45e-6" -> {integralSign: "-", integral: "123", decimal: "45", expoSign: "-", exponent: "6"}
export interface ScientificFloat {
    integralSign: "+" | "-";
    integral: string;
    decimal: string;
    expoSign: "+" | "-";
    exponent: string;
}

// Decimal floating point representation: mantissa * 10^decExp
// Example: 123.45e-6 -> {mantissa: 12345n, decExp: -8n}
export interface DecimalFloat {
    mantissa: bigint;
    decExp: bigint;
}

// Binary floating point representation: mantissa * 2^binExp
export interface BinaryFloat {
    mantissa: bigint;
    binExp: bigint;
}

/**
 * Parse scientific notation string into structured components
 * Handles all valid float formats: "123", "123.45", ".45", "123e4", "123.45e-6", etc.
 * @param input scientific notation string
 * @returns parsed float
 */
export function parseScientificFloat(input: string): ScientificFloat {
    const match = input.match(FloatRegex);
    if (!match) {
        throw Error("Invalid float format");
    }

    const [_all, mantissaSign, numberPart, _, exponentSign, exponent] = match;

    const float: ScientificFloat = {
        integralSign: "+",
        integral: "0",
        decimal: "0",
        expoSign: "+",
        exponent: "0",
    };

    const [integral, decimal] = numberPart.split(".");
    if (mantissaSign == "-") {
        float.integralSign = mantissaSign;
    }
    if (integral) {
        float.integral = integral;
    }
    if (decimal) {
        float.decimal = decimal;
    }
    if (exponentSign == "-") {
        float.expoSign = exponentSign;
    }
    if (exponent) {
        float.exponent = exponent;
    }

    return float;
}

/**
 * Convert scientific notation to decimal representation by eliminating the decimal point.
 * The decimal digits are absorbed into the mantissa, and decExp is adjusted accordingly.
 * Example: {integral: "123", decimal: "45", exponent: "6"} -> {mantissa: 12345n, decExp: 4n}
 * @param sci scientific float to convert
 * @returns decimal representation of float
 */
export function scientificToDecimal(sci: ScientificFloat): DecimalFloat {
    const float: DecimalFloat = {
        mantissa: BigInt(sci.integral),
        decExp: BigInt(sci.exponent),
    };

    if (sci.expoSign == "-") {
        float.decExp *= -1n;
    }

    // Convert decimal part to digits and shift into mantissa
    const digits = sci.decimal.split("").map(d => BigInt(d));
    for (const digit of digits) {
        float.mantissa = float.mantissa * 10n + digit;
        float.decExp--;
    }

    // remove trailing zeros to avoid wasting mantissa digits
    while (float.mantissa != 0n && float.mantissa % 10n == 0n) {
        float.mantissa /= 10n;
        float.decExp++;
    }

    if (float.mantissa == 0n) {
        float.decExp = 0n;
    }

    if (sci.integralSign == "-") {
        float.mantissa *= -1n;
    }

    return float;
}

/**
 * Convert decimal floating point to binary floating point.
 * Uses extra precision bits during conversion to maintain accuracy, then truncates at the end.
 * @param dec decimal float to convert
 * @param bits number of mantissa bits
 * @param extraBits number of extra bits during calculation
 * @returns binary, normalized representation of float
 */
export function decimalToBinaryFloat(dec: DecimalFloat, bits: number, extraBits: number): BinaryFloat {
    // Working precision: target bits - 1 (for range [0.5, 1)) + extra precision bits
    const mBits = bits - 1 + extraBits;
    let res: BinaryFloat = {
        mantissa: dec.mantissa << BigInt(extraBits),
        binExp: BigInt(mBits)
    };

    // Start with mantissa shifted left by extraBits for additional working precision
    res = normalize(res, mBits);
    if (dec.decExp > 0n) {
        // Handle positive decimal exponent: multiply by 10^decExp
        // Each multiplication is followed by normalization to prevent overflow
        for (let i = 0; i < dec.decExp; i++) {
            res.mantissa *= 10n;
            res = normalize(res, mBits);
        }
    } else if (dec.decExp < 0n) {
        // Handle negative decimal exponent: divide by 10^|decExp|
        // Each division is followed by normalization to maintain precision
        for (let i = 0; i < -dec.decExp; i++) {
            res.mantissa /= 10n;
            res = normalize(res, mBits);
        }
    }

    // Remove the extra precision bits that were added for working precision
    res.mantissa >>= BigInt(extraBits);
    res.binExp -= BigInt(extraBits);

    // Final normalization to target bit width (bits - 1 to reserve sign bit)
    res = normalize(res, bits - 1);

    return res;
}

/**
 * Normalize a float by keeping the MSB set
 * @param float input float
 * @param bits mantissa bits
 * @returns normalized float
 */
export function normalize(float: BinaryFloat, bits: number): BinaryFloat {
    const res: BinaryFloat = { ...float };

    if (res.mantissa == 0n) {
        res.binExp = 0n;
        return res;
    }

    const isNegative = res.mantissa < 0n;
    let absM = isNegative ? -res.mantissa : res.mantissa;

    // Target: Mantissa should be in [0.5, 1) when dividing by 2^n-1
    // -> MSB should be set, so we want values in [2^n-1, 2^n)
    const maxValue = 1n << BigInt(bits);
    const minValue = 1n << BigInt(bits - 1);

    // Shift left if too small
    while (absM < minValue && absM != 0n) {
        absM <<= 1n;
        res.binExp--;
    }

    // Shift right if too large
    while (absM >= maxValue) {
        absM >>= 1n;
        res.binExp++;
    }

    res.mantissa = isNegative ? -absM : absM;
    return res;
}

// Convert to DEC format with proper two's complement handling
export function floatToDEC(float: BinaryFloat): [number, number, number] {
    let exponent = float.binExp;
    let mantissa = float.mantissa;

    // Handle two's complement for 12-bit exponent
    if (exponent < 0) {
        exponent += 1n << 12n;
    }

    // Handle two's complement for 24-bit mantissa
    if (mantissa < 0) {
        mantissa += 1n << 24n;
    }

    return [
        Number(exponent & 0o7777n),
        Number((mantissa >> 12n) & 0o7777n),
        Number(mantissa & 0o7777n),
    ];
}

export function toDECFloat(scientific: string): [number, number, number] {
    const sciFloat = parseScientificFloat(scientific);
    const decimalFloat = scientificToDecimal(sciFloat);
    const binFloat = decimalToBinaryFloat(decimalFloat, 24, 8);
    const res = floatToDEC(binFloat);
    return res;
}

/**
 * Convert a DEC 24-bit float to a JS number
 * @param e 12 bit exponent
 * @param mHi high word of 24-bit mantissa
 * @param mLo low word of 24-bit mantissa
 * @returns number
 */
export function fromDecFloat(e: number, mHi: number, mLo: number): number {
    const binFloat = decToFloat([e, mHi, mLo]);
    const decimalFloat = binaryToDecimalFloat(binFloat, 24);
    const sciFloat = decimalToScientific(decimalFloat);
    const scientific = unparseScientific(sciFloat);
    return Number.parseFloat(scientific);
}

function decToFloat(input: [number, number, number]): BinaryFloat {
    const [e, mHi, mLo] = input;

    // two's complement exp
    let exp = BigInt(e);
    if (exp & (1n << 11n)) {
        exp -= 1n << 12n;
    }

    let m = (BigInt(mHi) << 12n) | BigInt(mLo);

    // two's complement mantissa
    if (m & (1n << 23n)) {
        m -= 1n << 24n;
    }

    return {
        binExp: exp,
        mantissa: m,
    };
}

function binaryToDecimalFloat(bin: BinaryFloat, bits: number): DecimalFloat {
    if (bin.mantissa === 0n) {
        return { mantissa: 0n, decExp: 0n };
    }

    // The binary float represents: mantissa * 2^binExp
    // We want to find: decMantissa * 10^decExp such that they're equal
    let mantissa = bin.mantissa;
    let binExp = bin.binExp;
    let decExp = 0n;

    // Adjust for the fact that the mantissa is normalized to [2^22, 2^23) for 23-bit precision
    // This represents the [0.5, 1.0) range in DEC format
    binExp -= BigInt(bits - 1); // Adjust for normalization

    if (binExp > 0n) {
        // Handle positive binary exponent: multiply by 2^binExp
        for (let i = 0n; i < binExp; i++) {
            mantissa *= 2n;
        }
    } else if (binExp < 0n) {
        // Handle negative binary exponent: divide by 2^|binExp|
        for (let i = 0n; i < -binExp; i++) {
            // To divide by 2 in decimal representation, multiply by 5 and decrease decExp
            mantissa *= 5n;
            decExp--;
        }
    }

    // Remove trailing zeros and adjust decExp
    while (mantissa % 10n === 0n && mantissa !== 0n) {
        mantissa /= 10n;
        decExp++;
    }

    return { mantissa, decExp };
}

function decimalToScientific(df: DecimalFloat): ScientificFloat {
    let mantissa = df.mantissa;
    const decExp = df.decExp;

    if (mantissa === 0n) {
        return {
            integralSign: "+",
            integral: "0",
            decimal: "0",
            expoSign: "+",
            exponent: "0",
        };
    }

    if (mantissa < 0n) {
        mantissa = -mantissa;
    }

    const mantStr = mantissa.toString();

    // Determine position of decimal point
    // We want scientific form: one digit before the decimal point
    const totalDigits = BigInt(mantStr.length);
    const exponent = decExp + totalDigits - 1n;

    const integral = mantStr[0];
    const decimal = mantStr.slice(1) || "0";

    return {
        integralSign: df.mantissa < 0n ? "-" : "+",
        integral,
        decimal,
        expoSign: exponent < 0n ? "-" : "+",
        exponent: exponent < 0n ? (-exponent).toString() : exponent.toString(),
    };
}

function unparseScientific(sciFloat: ScientificFloat): string {
    const sciStr =
        `${sciFloat.integralSign}${sciFloat.integral}` +
        `.${sciFloat.decimal}` +
        `e${sciFloat.expoSign}${sciFloat.exponent}`;
    return sciStr;
}
