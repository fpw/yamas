import * as PDP8 from "../utils/PDP8";
import { Context } from "./Context";

export class LinkTable {
    // [field][page][index]
    private entries: number[][][] = [];

    public constructor() {
        for (let field = 0; field < PDP8.NumFields; field++) {
            this.entries[field] = [];
            for (let page = 0; page < PDP8.NumPages; page++) {
                this.entries[field][page] = [];
            }
        }
    }

    public enter(ctx: Context, page: number, value: number): number {
        const field = ctx.field;
        let delta = 0;
        if (page != 0 && ctx.reloc != 0) {
            const relocPage = PDP8.calcPageNum(ctx.clc + ctx.reloc);
            delta = PDP8.firstAddrInPage(relocPage) - PDP8.firstAddrInPage(page);
            if (delta % PDP8.PageSize != 0) {
                throw Error("Relocating link tables to mid-page not supported");
            }
        }

        const idx = this.tryLookup(field, page, value);
        if (idx !== undefined) {
            return idx + delta;
        }

        if (this.entries[field][page].length == PDP8.PageSize) {
            throw Error(`No more space in link page ${page} on field ${field}`);
        }

        this.entries[field][page].push(value);
        return this.indexToAddr(page, this.entries[field][page].length - 1) + delta;
    }

    public checkOverlap(field: number, clc: number) {
        const page = PDP8.calcPageNum(clc);
        const linkCount = this.entries[field][page].length;
        if (linkCount == 0) {
            return;
        }

        const lowAddr = this.indexToAddr(page, linkCount - 1);
        if (clc >= lowAddr) {
            throw Error(`Link table for page ${page} in field ${field} overlap`);
        }
    }

    private tryLookup(field: number, page: number, value: number): number | undefined {
        for (let i = 0; i < this.entries[field][page].length; i++) {
            if (this.entries[field][page][i] == value) {
                return this.indexToAddr(page, i);
            }
        }
        return undefined;
    }

    private indexToAddr(page: number, idx: number): number {
        return page * PDP8.PageSize + (PDP8.PageSize - 1 - idx);
    }

    public visit(f: (field: number, addr: number, val: number) => void) {
        for (let field = 0; field < PDP8.NumFields; field++) {
            for (let page = 0; page < PDP8.NumPages; page++) {
                const firstAddr = this.indexToAddr(page, this.entries[field][page].length - 1);
                const vals = this.entries[field][page].toReversed();
                vals.forEach((v, i) => f(field, firstAddr + i, v));
            }
        }
    }
}
