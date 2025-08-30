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

// Intermediate representation: parsed components of scientific notation string
// Example: "-123.04e-6" -> { sign: -1, integral: -123, decimalDigits: [0, 4], exponent: 6 }
export interface ScientificFloat {
    sign: -1n | 1n;
    integral: bigint; // always positive
    decimalDigits: bigint[];
    exponent: bigint;
}

// RegEx to parse scientific notation: optional sign, digits with decimal point, optional exponent
const SciFloatFormat = /^([-+])?(\d+\.\d*|\d*\.\d+|\d+)(?:e([-+]?)(\d+))?$/i;

/**
 * Parse scientific notation string into structured components
 * Handles all valid float formats: "123", "123.45", ".45", "123e4", "123.45e-6", etc.
 * @param input scientific notation string
 * @returns parsed float
 */
export function parseScientificFloat(input: string): ScientificFloat {
    const match = input.match(SciFloatFormat);
    if (!match) {
        throw Error("Invalid float format");
    }

    const [_all, mantissaSign, numberPart, exponentSign, exponent] = match;

    const float: ScientificFloat = {
        sign: 1n,
        integral: 0n,
        decimalDigits: [],
        exponent: 0n,
    };

    const [integral, decimal] = numberPart.split(".");
    if (integral) {
        float.integral = BigInt(integral);
    }
    if (mantissaSign == "-") {
        float.sign = -1n;
    }
    if (decimal) {
        float.decimalDigits = toDigits(decimal);
    }
    if (exponent) {
        float.exponent = BigInt(exponent);
    }
    if (exponentSign == "-") {
        float.exponent *= -1n;
    }

    return float;
}

export function toDigits(numStr: string): bigint[] {
    return numStr.split("").map(d => BigInt(d));
}

/**
 * Convert a ScientificFloat into a string representation, e.g. -123.456e3
 * @param sciFloat input float
 * @returns string in scientific notation
 */
export function toScientificString(sciFloat: ScientificFloat): string {
    let sciStr = sciFloat.sign < 0n ? "-" : "";
    sciStr += `${sciFloat.integral}`;
    if (sciFloat.decimalDigits.length > 0) {
        sciStr += `.${sciFloat.decimalDigits.join("")}`;
    }
    if (sciFloat.exponent != 0n) {
        sciStr += `e${sciFloat.exponent}`;
    }
    return sciStr;
}
