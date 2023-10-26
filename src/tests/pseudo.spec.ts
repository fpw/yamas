import { assemble } from "./util";

describe("GIVEN an assembler", () => {
    describe("WHEN evaluating the PAGE statement on page boundaries", () => {
        const data = assemble(`
            *177
            PAGE
            A=.
            PAGE / Verified against dec-08-cma1-pb
            B=.
            *576
            HLT
            PAGE
            C=.
        `);
        test("THEN it should behave as intended", () => {
            expect(data.symbols["A"]).toEqual(0o200);
            expect(data.symbols["B"]).toEqual(0o200);
            expect(data.symbols["C"]).toEqual(0o600);
        });
    });
});
