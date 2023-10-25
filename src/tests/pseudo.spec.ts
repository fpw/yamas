import { assemble } from "./util";

describe("GIVEN an assembler", () => {
    describe("WHEN evaluating the PAGE statement on page boundaries", () => {
        const data = assemble(`
            *177
            PAGE
            A=.
            PAGE / as per macro8x and PALBART because they use the last emitted address, TODO: test against PAL8
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
