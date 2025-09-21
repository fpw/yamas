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

export const PageSize = 0o200;
export const NumPages = 32;
export const FieldSize = NumPages * PageSize;
export const NumFields = 8;
export const MemSize = NumFields * FieldSize;

export function getPageNum(loc: number): number {
    return (loc >> 7) & 31;
}

export function getPageOffset(loc: number): number {
    return loc & 0o177;
}

export function getAddrFromPageAndOffset(page: number, offset: number): number {
    return (page * PageSize + offset) & 0o7777;
}

export function isMRIOp(op: number): boolean {
    return ((op & 0o7000) == op) && (op <= 0o5000);
}
