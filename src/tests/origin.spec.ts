import { assemble, getSymbolValue } from "./util";

describe("GIVEN an assembler", () => {
    describe("WHEN evaluating the origin statement", () => {
        const asm = assemble(`
            A=.
            *1234; B=.
            *100+20+4; C=.
        `);
        test("THEN it should behave as intended", () => {
            expect(getSymbolValue(asm, "A")).toEqual(0o200);
            expect(getSymbolValue(asm, "B")).toEqual(0o1234);
            expect(getSymbolValue(asm, "C")).toEqual(0o124);
        });
    });
});
