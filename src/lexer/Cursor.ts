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

export interface Cursor {
    inputName: string;
    dataIdx: number;
    colIdx: number;
    lineIdx: number;
}

export interface CursorExtent {
    cursor: Cursor;
    width: number;
}

export interface HasExtent {
    extent: CursorExtent;
}

// given two things that have cursor extents, find the full extent from start to end + width
export function calcExtent(start: HasExtent, end: HasExtent | undefined): CursorExtent {
    let width: number;
    if (end) {
        width = end.extent.cursor.dataIdx - start.extent.cursor.dataIdx + end.extent.width;
    } else {
        width = start.extent.width;
    }

    return { cursor: start.extent.cursor, width: width };
}
