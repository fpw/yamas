import { assemble } from "./util";

describe("GIVEN an assembler", () => {
    describe("WHEN evaluating conditional statements", () => {
        const data = assemble(`
            IFZERO 0<A=1>
        `);
        test("THEN they should behave as intended", () => {
            expect(data.symbols["A"]).toEqual(1);
        });
    });
});
