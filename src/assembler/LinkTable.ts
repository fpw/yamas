export class LinkTable {
    private entries: number[][][] = [];

    public constructor() {
        for (let field = 0; field < 8; field++) {
            this.entries[field] = [];
            for (let page = 0; page < 32; page++) {
                this.entries[field][page] = [];
            }
        }
    }

    public has(field: number, page: number, value: number): boolean {
        return this.tryLookup(field, page, value) !== undefined;
    }

    public enter(field: number, page: number, value: number): number {
        const idx = this.tryLookup(field, page, value);
        if (idx !== undefined) {
            return idx;
        }

        this.entries[field][page].push(value);
        return this.indexToAddr(page, this.entries[field][page].length - 1);
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
        return page * 0o200 + (0o177 - idx);
    }

    public visit(f: (field: number, addr: number, val: number) => void) {
        for (let field = 0; field < 8; field++) {
            for (let page = 0; page < 32; page++) {
                for (let i = this.entries[field][page].length - 1; i >= 0; i--) {
                    f(field, this.indexToAddr(page, i), this.entries[field][page][i]);
                }
            }
        }
    }
}
