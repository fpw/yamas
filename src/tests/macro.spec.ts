import { assemble, getSymbolValue } from "./util";

describe("GIVEN an assembler", () => {
    describe("WHEN evaluating conditional statements", () => {
        const asm = assemble(`
            IFZERO 0<A=1>
        `);
        test("THEN they should behave as intended", () => {
            expect(getSymbolValue(asm, "A")).toEqual(1);
        });
    });
});
