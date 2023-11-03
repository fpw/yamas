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

export class LinkTable {
    // [page][index]
    private entries: number[][] = [];

    public constructor() {
        this.clear();
    }

    public enter(ctx: Context, page: number, value: number): number {
        let delta = 0;
        if (page != 0 && ctx.reloc != 0) {
            if (ctx.reloc % PDP8.PageSize != 0) {
                throw Error("Relocating link tables to mid-page not supported");
            }
            const relocPage = PDP8.calcPageNum(ctx.getClc(true));
            delta = PDP8.firstAddrInPage(relocPage) - PDP8.firstAddrInPage(page);
        }

        const idx = this.tryLookup(page, value);
        if (idx !== undefined) {
            return idx + delta;
        }

        if (this.entries[page].length == PDP8.PageSize) {
            throw Error(`No more space in link page ${page}`);
        }

        this.entries[page].push(value);
        return this.indexToAddr(page, this.entries[page].length - 1) + delta;
    }

    public checkOverlap(clc: number) {
        const page = PDP8.calcPageNum(clc);
        const linkCount = this.entries[page].length;
        if (linkCount == 0) {
            return;
        }

        const lowAddr = this.indexToAddr(page, linkCount - 1);
        if (clc >= lowAddr) {
            throw Error(`Link table for page ${page} overlap`);
        }
    }

    public clear() {
        for (let page = 0; page < PDP8.NumPages; page++) {
            this.entries[page] = [];
        }
    }

    public visit(f: (addr: number, val: number) => void) {
        for (let page = 0; page < PDP8.NumPages; page++) {
            for (let i = this.entries[page].length - 1; i >= 0; i--) {
                const addr = this.indexToAddr(page, i);
                f(addr, this.entries[page][i]);
            }
        }
    }

    private tryLookup(page: number, value: number): number | undefined {
        for (let i = 0; i < this.entries[page].length; i++) {
            if (this.entries[page][i] == value) {
                return this.indexToAddr(page, i);
            }
        }
        return undefined;
    }

    private indexToAddr(page: number, idx: number): number {
        return page * PDP8.PageSize + (PDP8.PageSize - 1 - idx);
    }
}
