/* eslint-disable max-lines-per-function */
import { assemble } from "./util";

describe("GIVEN an assembler", () => {
    describe("WHEN evaluating conditional statements with various syntax variations", () => {
        const data = assemble(`
            / Testing different syntax variations
            IFZERO 0<A=1>
            IFNZRO 0 <
                AA=1
            >
            IFDEF X <BB=2
            >
            IFNDEF X <
                B=2
            >
            Y=2
            IFDEF Y <C=2;TAD>
            IFNDEF Y <CC=2 ; CLA>
        `);
        test("THEN they should assemble without errors", () => {
            expect(data.symbols["A"]).toEqual(1);
            expect(data.symbols["AA"]).toBeUndefined();
            expect(data.symbols["B"]).toEqual(2);
            expect(data.symbols["BB"]).toBeUndefined();
            expect(data.symbols["C"]).toEqual(2);
            expect(data.symbols["CC"]).toBeUndefined();
        });
    });

    describe("WHEN evaluating nested conditional statements", () => {
        const data = assemble(`
            IFNDEF A <
                B=1
                IFZERO B-1 <
                    C=5
                >
            >
        `);
        test("THEN they should work as expected", () => {
            expect(data.symbols["C"]).toEqual(5);
        });
    });
});
