import { assemble, getSymbolValue } from "./util";

describe("GIVEN an assembler", () => {
    describe("WHEN evaluating the TEXT statement", () => {
        const asm = assemble(`
             *0
            TEXT "Hello" / Odd length -> null termination in last symbol
            A=.
            *0
            TEXT "World!" / Even length -> must add word for null termination
            B=.
       `);
        test("THEN it should behave as intended", () => {
            expect(getSymbolValue(asm, "A")).toEqual(3);
            expect(getSymbolValue(asm, "B")).toEqual(4);
        });
    });
});
