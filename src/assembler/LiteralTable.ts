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

export class LiteralTable {
    private pages: LiteralPage[] = [];

    public constructor() {
        for (let page = 0; page < PDP8.NumPages; page++) {
            let lowestAddr = 0;
            if (page == 0) {
                // on page zero, exclude the auto-index region
                lowestAddr = 0o20;
            }
            this.pages[page] = new LiteralPage(page, lowestAddr);
        }
    }

    public findOrAddOnZeroPage(value: number): number {
        // explicit zero add: never relocated
        return this.pages[0].findOrAddValue(0, value);
    }

    public findOrAddOnCurrentPage(clc: number, reloc: number, value: number): number {
        // page zero also allowed here: if a relocation should still generate a current page access
        const page = PDP8.getPageNum(clc + reloc);
        return this.pages[page].findOrAddValue(reloc, value);
    }

    // Check if there's an overlap of literal tables with the interval [first, last]
    public checkOverlap(firstAddr: number, lastAddr: number): boolean {
        const firstPage = PDP8.getPageNum(firstAddr);
        const lastPage = PDP8.getPageNum(lastAddr);

        // If the write is only inside a single page, we only need to check the higher address
        if (firstPage == lastPage) {
            return this.pages[lastPage].hasOverlapWithAddr(lastAddr);
        }

        // check all in between -> any entry means that an interval overlaps with an entry
        // we need to include the first page because we already know that everything from
        // firstAddr to the end of the first page is overwritten, i.e. all of the table is always overwritten
        for (let page = firstPage; page < lastPage; page++) {
            if (this.pages[page].hasEntries()) {
                return true;
            }
        }

        // check last page
        if (this.pages[lastPage].hasOverlapWithAddr(lastAddr)) {
            return true;
        }

        return false;
    }

    public clear() {
        this.clearFrom(0);
    }

    public clearNonZero() {
        this.clearFrom(1);
    }

    private clearFrom(startPage: number) {
        for (let page = startPage; page < PDP8.NumPages; page++) {
            this.pages[page].clear();
        }
    }

    public visitAllEntries(f: (addr: number, val: number) => void) {
        this.pages.forEach(p => p.visitEntries(f));
    }
}

interface LiteralEntry {
    value: number;
    relocationOffset: number;
}

const TopAddr = PDP8.PageSize - 1;

class LiteralPage {
    // [address offset in page] = value, address array is sparse
    private entries: (LiteralEntry | undefined)[] = [];
    private pageNum: number;
    private bottomAddr: number;
    private nextFreeOffset = TopAddr;

    public constructor(pageNum: number, bottomAddr: number) {
        this.pageNum = pageNum;
        this.bottomAddr = bottomAddr;
    }

    public clear() {
        this.nextFreeOffset = TopAddr;
        this.entries = [];
    }

    public hasEntries(): boolean {
        return this.nextFreeOffset < TopAddr;
    }

    public findOrAddValue(reloc: number, value: number): number {
        let offset = this.findValue(value);
        if (offset === undefined) {
            offset = this.getNextFreeAddr();
            this.entries[offset] = { value, relocationOffset: reloc };
        }
        return PDP8.getAddrFromPageAndOffset(this.pageNum, offset);
    }

    private getNextFreeAddr(): number {
        if (this.nextFreeOffset <= this.bottomAddr) {
            throw Error(`Literal table overflow on page ${this.pageNum}`);
        }
        return this.nextFreeOffset--;
    }

    private findValue(value: number): number | undefined {
        for (let offset = TopAddr; offset > this.nextFreeOffset; offset--) {
            if (this.entries[offset]?.value === value) {
                return offset;
            }
        }
        return undefined;
    }

    public hasOverlapWithAddr(addr: number): boolean {
        const offset = PDP8.getPageOffset(addr);
        return this.entries[offset] !== undefined;
    }

    public visitEntries(f: (addr: number, val: number) => void) {
        for (let offset = TopAddr; offset > this.nextFreeOffset; offset--) {
            const entry = this.entries[offset];
            if (entry === undefined) {
                throw Error("Internal error: Hole in literal table");
            }
            const value = entry.value;
            const addr = PDP8.getAddrFromPageAndOffset(this.pageNum, offset - entry.relocationOffset);
            f(addr, value);
        }
    }
}
