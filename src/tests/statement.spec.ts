import { assemble, getSymbolValue } from "./util";

describe("GIVEN an assembler", () => {
    describe("WHEN evaluating assignment statements with undefined right-hand sides", () => {
        const asm = assemble(`
            A=B+2
            B=3
        `);
        test("THEN they should behave as intended", () => {
            expect(getSymbolValue(asm, "A")).toEqual(5);
        });
    });
});
