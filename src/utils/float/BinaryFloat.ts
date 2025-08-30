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

import { DecimalFloat, removeTrailingZeros } from "./DecimalFloat.js";

// Binary floating point representation: (mantissa / 2^precision) * 2^binExp
export interface BinaryFloat {
    mantissa: bigint;
    precision: bigint; // number of significant bits in mantissa
    binExp: bigint;
}

export function binaryToDecimalFloat(bin: BinaryFloat): DecimalFloat {
    if (bin.mantissa === 0n) {
        return { mantissa: 0n, decExp: 0n };
    }

    // The binary float represents: mantissa * 2^binExp
    // We want to find: decMantissa * 10^decExp such that they're equal
    let float: DecimalFloat = {
        mantissa: bin.mantissa,
        decExp: 0n,
    };

    // Adjust for the fact that the mantissa is normalized to [0.5, 1) for the given precision
    // -> divide by 2^n and the actual exponent
    const binExp = bin.binExp -  bin.precision;

    if (binExp > 0n) {
        // Handle positive binary exponent: multiply by 2^binExp
        float.mantissa <<= binExp;
    } else if (binExp < 0n) {
        // Handle negative binary exponent: divide by 2^|binExp|
        for (let i = 0n; i < -binExp; i++) {
            // To divide by 2 in decimal representation, multiply by 5 and decrease decExp
            float.mantissa *= 5n;
            float.decExp--;
        }
    }

    float = removeTrailingZeros(float);
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
export function decimalToBinaryFloat(dec: DecimalFloat, bits: bigint, extraBits: bigint): BinaryFloat {
    // Working precision: target bits - 1 (for two's complement) + extra precision bits
    const mBits = bits - 1n + extraBits;
    const sign = dec.mantissa < 0n ? -1n : 1n;
    let res: BinaryFloat = {
        mantissa: (dec.mantissa * sign) << extraBits,
        precision: mBits,
        binExp: mBits,
    };

    // Start with mantissa shifted left by extraBits for additional working precision
    res = normalizeBinFloat(res);
    if (dec.decExp > 0n) {
        // Handle positive decimal exponent: multiply by 10^decExp
        for (let i = 0; i < dec.decExp; i++) {
            res.mantissa *= 10n;
        }
    } else if (dec.decExp < 0n) {
        // Handle negative decimal exponent: divide by 10^|decExp|
        for (let i = 0; i < -dec.decExp; i++) {
            res.mantissa /= 10n;
            // keep precision by normalizing after each step
            res = normalizeBinFloat(res);
        }
    }

    // Remove the extra precision bits that were added for extra precision
    res.mantissa = (res.mantissa >> extraBits) * sign;
    res.binExp -= extraBits;
    res.precision -= extraBits;

    // Final normalization to target bit width
    res = normalizeBinFloat(res);
    return res;
}

/**
 * Normalize a float by keeping the MSB set
 * @param float input float
 * @param bits mantissa bits
 * @returns normalized float
 */
export function normalizeBinFloat(float: BinaryFloat): BinaryFloat {
    const res: BinaryFloat = { ...float };

    if (res.mantissa == 0n) {
        res.binExp = 0n;
        return res;
    }

    const isNegative = res.mantissa < 0n;
    let absM = isNegative ? -res.mantissa : res.mantissa;

    // Target: Mantissa should be in [0.5, 1)
    // Due to two's complement, we lose 1 bit of precision for the sign
    // -> Values must be in [2^n-1, 2^n)
    const maxValue = 1n << float.precision;
    const minValue = 1n << (float.precision - 1n);

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
