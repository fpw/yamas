/* eslint-disable max-lines-per-function */
import {assemble, assembleWithErrors} from "./TestUtils";

describe("GIVEN a program with conditional statements", () => {
    describe("WHEN evaluating conditional statements with various syntax variations", () => {
        const data = assemble(`
            / Testing different syntax variations
            IFZERO 0<A=1>
            IFNZRO 0 <
                AA=1 / Comment inside
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
            IFNDEF D<IFNDEF E<F=23>>
        `);
        test("THEN they should work as expected", () => {
            expect(data.symbols["C"]).toEqual(5);
            expect(data.symbols["F"]).toEqual(0o23);
        });
    });

    describe("WHEN evaluating grouped conditional expressions", () => {
        const data = assemble(`
            A=0
            B=1
            C=0
            IFNZRO A B C <D=2>
        `);
        test("THEN they should be ORed", () => {
            expect(data.symbols["D"]).toEqual(2);
        });
    });

    describe("WHEN accessing undefined symbols in condition bodies", () => {
        const data = assembleWithErrors(`
            IFNDEF A <GLITCH>
        `);
        test("THEN it should generate an error", () => {
            expect(data.errors.length).toBeGreaterThan(0);
        });
    });

    describe("WHEN evaluating undefined symbols that evaluate differently in pass 1 and 2", () => {
        describe("WHEN IFNZRO doesn't run in pass 1 but in pass 2", () => {
            const data = assembleWithErrors(`
                IFNZRO A <B=1>
                A=1
            `);
            test("THEN it should generate an error", () => {
                expect(data.errors.length).toBeGreaterThan(0);
            });
        });

        describe("WHEN IFZERO runs in pass 1 but not in pass 2", () => {
            const data = assembleWithErrors(`
                IFZERO A <TAD>
                A=1
            `);
            test("THEN it should generate an error", () => {
                expect(data.errors.length).toBeGreaterThan(0);
            });
        });
    });

    describe("WHEN evaluating undefined symbols that evaluate the same in pass 1 and 2", () => {
        describe("WHEN IFNZRO runs in pass 1 and in pass 2", () => {
            const data = assemble(`
                IFZERO A <TAD>
                A=1-1
                B,
            `);
            test("THEN it should assemble successfully", () => {
                expect(data.symbols["B"]).toEqual(0o201);
            });
        });
    });
});
