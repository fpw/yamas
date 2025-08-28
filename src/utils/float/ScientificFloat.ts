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
// Example: "-123.45e-6" -> {integralSign: "-", integral: "123", decimal: "45", expoSign: "-", exponent: "6"}
// Both integral and exponent have a sign and leading zeros in the string are irrelevant -> parse to bigint
// Decimal part doesn't have a sign and leading zeros are relevant -> keep as unparsed string
export interface ScientificFloat {
    integral: bigint;
    decimal: string; // leading zeros are relevant, so keeping it a string for now
    exponent: bigint;
}

// RegEx to parse scientific notation: optional sign, digits with decimal point, optional exponent
const SciFloatFormat = /^([-+])?(\d+\.\d*|\d*\.\d+|\d+)(e([-+]?)(\d+))?$/i;

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

    const [_all, mantissaSign, numberPart, _, exponentSign, exponent] = match;

    const float: ScientificFloat = {
        integral: 0n,
        decimal: "0",
        exponent: 0n,
    };

    const [integral, decimal] = numberPart.split(".");
    if (integral) {
        float.integral = BigInt(integral);
    }
    if (mantissaSign == "-") {
        float.integral *= -1n;
    }
    if (decimal) {
        float.decimal = decimal;
    }
    if (exponent) {
        float.exponent = BigInt(exponent);
    }
    if (exponentSign == "-") {
        float.exponent *= -1n;
    }

    return float;
}

/**
 * Convert a ScientificFloat into a string representation, e.g. -123.456e3
 * @param sciFloat input float
 * @returns string in scientific notation
 */
export function toScientificString(sciFloat: ScientificFloat): string {
    let sciStr = `${sciFloat.integral}`;
    if (sciFloat.decimal != "0") {
        sciStr += `.${sciFloat.decimal}`;
    }
    if (sciFloat.exponent != 0n) {
        sciStr += `e${sciFloat.exponent}`;
    }
    return sciStr;
}
