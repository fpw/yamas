import { assemble } from "./util";

describe("GIVEN an assembler", () => {
    describe("WHEN evaluating the TEXT statement", () => {
        const data = assemble(`
             *0
            TEXT "Hello" / Odd length -> null termination in last symbol
            A=.
            *0
            TEXT "World!" / Even length -> must add word for null termination
            B=.
       `);
        test("THEN it should behave as intended", () => {
            expect(data.symbols["A"]).toEqual(3);
            expect(data.symbols["B"]).toEqual(4);
        });
    });
});
