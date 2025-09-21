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
import { Context } from "./Context.js";

interface LinkEntry {
    value: number;
    reloc: number;
}

export class LinkTable {
    // [page][offset] = value
    private entries: LinkEntry[][] = [];

    public constructor() {
        this.clear();
    }

    public enter(ctx: Context, page: number, value: number): number {
        let relocPage = 0;
        if (page != 0) {
            relocPage = PDP8.calcPageNum(ctx.getClc(true));
        }
        let offset = this.tryLookup(relocPage, value);
        if (offset === undefined) {
            offset = this.getFreeAddress(relocPage);
            this.entries[relocPage][offset] = { value, reloc: relocPage != 0 ? ctx.reloc : 0 };
        }
        const addr = PDP8.PageSize * relocPage + offset;
        return addr;
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
        throw Error(`Link table overflow on page ${page}`);
    }

    private tryLookup(page: number, value: number): number | undefined {
        for (let offset = PDP8.PageSize - 1; offset >= 0; offset--) {
            if (this.entries[page][offset]?.value === value) {
                return offset;
            }
        }

        return undefined;
    }

    // Check if there's an overlap of link tables with the interval [first, last]
    public checkOverlap(firstAddr: number, lastAddr: number): boolean {
        const firstPage = PDP8.calcPageNum(firstAddr);
        const lastPage = PDP8.calcPageNum(lastAddr);

        // If the write is only inside a single page, we only need to check the higher address
        if (firstPage == lastPage) {
            return this.hasOverlapWithAddr(lastAddr);
        }

        // check all in between -> any links means interval overlaps with a link
        // we need to include the first page because we already know that everything from
        // firstAddr to the end of the first page is overwritten, i.e. all of the linktable is always overwritten
        for (let page = firstPage; page < lastPage; page++) {
            const linkCount = this.entries[page].length;
            if (linkCount > 0) {
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
        const page = PDP8.calcPageNum(addr);
        const offset = PDP8.calcAddrInPage(addr);
        return this.entries[page][offset] !== undefined;
    }

    public clear(alsoZero = true) {
        for (let page = 0; page < PDP8.NumPages; page++) {
            if (page == 0 && !alsoZero) {
                continue;
            }
            this.entries[page] = [];
        }
    }

    public visit(f: (addr: number, val: number) => void) {
        for (let page = 0; page < PDP8.NumPages; page++) {
            for (let offset = PDP8.PageSize - 1; offset >= 0; offset--) {
                const entry = this.entries[page][offset];
                if (entry === undefined) {
                    continue;
                }
                const value = entry.value;
                const addr = page * PDP8.PageSize + offset - entry.reloc;
                f(addr, value);
            }
        }
    }
}
