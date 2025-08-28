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

import { BinaryFloat, binaryToDecimalFloat, decimalToBinaryFloat } from "./BinaryFloat.js";
import { scientificToDecimal, decimalToScientific } from "./DecimalFloat.js";
import { parseScientificFloat, toScientificString } from "./ScientificFloat.js";

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

/**
 * Parse a float given in scientific representation to three 12-bit words
 * @param scientific input string, e.g. -123.456e3
 * @returns 12-bit exponent, 12-bit high mantissa word, 12-bit low mantissa word
 */
export function encodeDECFloat(scientific: string): [number, number, number] {
    const sciFloat = parseScientificFloat(scientific);
    const decimalFloat = scientificToDecimal(sciFloat);
    const binFloat = decimalToBinaryFloat(decimalFloat, 24n, 8n);
    const res = binFloatToDEC(binFloat);
    return res;
}

function binFloatToDEC(float: BinaryFloat): [number, number, number] {
    if (float.precision != 23n) {
        throw Error("DEC floats need 23 bits of precision");
    }

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

/**
 * Convert a DEC 24-bit float to a JS number
 * @param e 12 bit exponent
 * @param mHi high word of 24-bit mantissa
 * @param mLo low word of 24-bit mantissa
 * @returns number in scientific notation
 */
export function decodeDECFloat(e: number, mHi: number, mLo: number): string {
    const binFloat = decToBinFloat([e, mHi, mLo]);
    const decimalFloat = binaryToDecimalFloat(binFloat);
    const sciFloat = decimalToScientific(decimalFloat);
    const scientific = toScientificString(sciFloat);
    return scientific;
}

function decToBinFloat(input: [number, number, number]): BinaryFloat {
    const [e, mHi, mLo] = input;

    // decode two's complement exponent
    let exp = BigInt(e);
    if (exp & (1n << 11n)) {
        exp -= 1n << 12n;
    }

    // decode two's complement mantissa
    let m = (BigInt(mHi) << 12n) | BigInt(mLo);
    if (m & (1n << 23n)) {
        m -= 1n << 24n;
    }

    return {
        binExp: exp,
        mantissa: m,
        precision: 23n,
    };
}
