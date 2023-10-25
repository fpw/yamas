import { assemble, getSymbolValue } from "./util";

describe("GIVEN an assembler", () => {
    describe("WHEN evaluating binary operators", () => {
        const asm = assemble(`
            DECIMAL
            A=20-10-3
            B=10+2^3
        `);
        test("THEN they should be left-associative", () => {
            expect(getSymbolValue(asm, "A")).toEqual(7);
            expect(getSymbolValue(asm, "B")).toEqual(36);
        });
    });

    describe("WHEN evaluating unary operators", () => {
        const asm = assemble(`
            DECIMAL
            A=+10
            B=-23
            C=2^-4
        `);
        test("THEN they should be correct", () => {
            expect(getSymbolValue(asm, "A")).toEqual(10);
            expect(getSymbolValue(asm, "B")).toEqual(-23 & 0o7777);
            expect(getSymbolValue(asm, "C")).toEqual(-8 & 0o7777);
        });
    });
});
