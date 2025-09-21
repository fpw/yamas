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

import * as PDP8 from "../utils/PDP8.js";

interface LiteralEntry {
    value: number;
    reloc: number;
}

export class LiteralTable {
    // Entries must be in order, so not using a map
    // [page][address offset in page] = value, address array is sparse
    private entries: (LiteralEntry | undefined)[][] = [];

    public constructor() {
        this.clear();
    }

    public enterZeroPage(value: number): number {
        return this.enterPage(0, 0, value);
    }

    public enterCurrentPage(clc: number, reloc: number, value: number): number {
        const page = PDP8.getPageNum(clc + reloc);
        return this.enterPage(page, reloc, value);
    }

    private enterPage(page: number, reloc: number, value: number): number {
        let offset = this.findValue(page, value);
        if (offset === undefined) {
            offset = this.getFreeAddress(page);
            this.entries[page][offset] = { value, reloc };
        }
        return PDP8.getAddrFromPageAndOffset(page, offset);
    }

    private findValue(page: number, value: number): number | undefined {
        const idx = this.entries[page].findLastIndex(x => x?.value == value);
        if (idx < 0) {
            return undefined;
        }
        return idx;
    }

    private getFreeAddress(page: number): number {
        let lowestAddr = 0;
        if (page == 0) {
            // on page 0, also make sure to not collide with auto-index region
            lowestAddr = 0o20;
        }

        for (let offset = PDP8.PageSize - 1; offset >= lowestAddr; offset--) {
            if (this.entries[page][offset] === undefined) {
                return offset;
            }
        }
        throw Error(`Literal table overflow on page ${page}`);
    }

    // Check if there's an overlap of literal tables with the interval [first, last]
    public checkOverlap(firstAddr: number, lastAddr: number): boolean {
        const firstPage = PDP8.getPageNum(firstAddr);
        const lastPage = PDP8.getPageNum(lastAddr);

        // If the write is only inside a single page, we only need to check the higher address
        if (firstPage == lastPage) {
            return this.hasOverlapWithAddr(lastAddr);
        }

        // check all in between -> any entry means that an interval overlaps with an entry
        // we need to include the first page because we already know that everything from
        // firstAddr to the end of the first page is overwritten, i.e. all of the table is always overwritten
        for (let page = firstPage; page < lastPage; page++) {
            if (this.entries[page].some(x => x !== undefined)) {
                return true;
            }
        }

        // check last page
        if (this.hasOverlapWithAddr(lastAddr)) {
            return true;
        }

        return false;
    }

    private hasOverlapWithAddr(addr: number): boolean {
        const page = PDP8.getPageNum(addr);
        const offset = PDP8.getPageOffset(addr);
        return this.entries[page][offset] !== undefined;
    }

    public clear() {
        this.clearFrom(0);
    }

    public clearNonZero() {
        this.clearFrom(1);
    }

    private clearFrom(startPage: number) {
        for (let page = startPage; page < PDP8.NumPages; page++) {
            this.entries[page] = new Array<LiteralEntry>(PDP8.PageSize);
        }
    }

    public visitAll(f: (addr: number, val: number) => void) {
        for (let page = 0; page < PDP8.NumPages; page++) {
            for (let offset = PDP8.PageSize - 1; offset >= 0; offset--) {
                const entry = this.entries[page][offset];
                if (entry === undefined) {
                    // entries are contiguous, so the first empty entry
                    // signifies the end of an entire page
                    break;
                }
                const value = entry.value;
                const addr = PDP8.getAddrFromPageAndOffset(page, offset - entry.reloc);
                f(addr, value);
            }
        }
    }
}
