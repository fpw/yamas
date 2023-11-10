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

export function replaceNonPrints(s: string): string {
    return s
        .replaceAll("\t", "<TAB>")
        .replaceAll("\r", "<CR>")
        .replaceAll("\n", "<LF>")
        .replaceAll("\v", "<VT>")
        .replaceAll("\b", "<BS>")
        .replaceAll("\x00", "<NUL>")
        .replaceAll("\x07", "<BEL>")
        .replaceAll("\f", "<FF>");
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

export function normalizeSymbolName(name: string) {
    return name.toUpperCase().substring(0, 6);
}
