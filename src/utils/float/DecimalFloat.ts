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

import { ScientificFloat, toDigits } from "./ScientificFloat.js";

// Decimal floating point representation: mantissa * 10^decExp
// Example: 123.45e-6 -> {mantissa: 12345n, decExp: -8n}
export interface DecimalFloat {
    mantissa: bigint;
    decExp: bigint;
}

/**
 * Convert scientific notation to decimal representation by eliminating the decimal point.
 * The decimal digits are absorbed into the mantissa, and decExp is adjusted accordingly.
 * Example: {integral: "123", decimal: "45", exponent: "6"} -> {mantissa: 12345n, decExp: 4n}
 * @param sci scientific float to convert
 * @returns decimal representation of float
 */
export function scientificToDecimal(sci: ScientificFloat): DecimalFloat {
    let float: DecimalFloat = {
        mantissa: sci.integral,
        decExp: sci.exponent,
    };

    // Convert decimal part to digits and shift into mantissa
    for (const digit of sci.decimalDigits) {
        float.mantissa = float.mantissa * 10n + digit;
        float.decExp--;
    }

    // remove trailing zeros to avoid wasting mantissa digits
    float = removeTrailingZeros(float);

    if (float.mantissa == 0n) {
        float.decExp = 0n;
    }

    float.mantissa *= sci.sign;

    return float;
}

export function decimalToScientific(df: DecimalFloat): ScientificFloat {
    const sign = df.mantissa < 0n ? -1n : 1n;
    const mantissa = df.mantissa * sign;
    const decExp = df.decExp;

    if (mantissa === 0n) {
        return {
            sign,
            integral: 0n,
            decimalDigits: [],
            exponent: 0n,
        };
    }

    const mantStr = mantissa.toString();

    // Determine position of decimal point
    // We want scientific form: one digit before the decimal point
    const totalDigits = BigInt(mantStr.length);
    const exponent = decExp + totalDigits - 1n;

    const integral = mantStr[0];
    const decimal = mantStr.slice(1) || "0";

    return {
        sign,
        integral: BigInt(integral),
        decimalDigits: toDigits(decimal),
        exponent,
    };
}

export function removeTrailingZeros(x: DecimalFloat): DecimalFloat {
    const float: DecimalFloat = { ...x };
    while (float.mantissa != 0n && float.mantissa % 10n == 0n) {
        float.mantissa /= 10n;
        float.decExp++;
    }
    return float;
}
