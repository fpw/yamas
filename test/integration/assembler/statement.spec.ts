/* eslint-disable max-lines-per-function */
import { assemble, assembleWithErrors } from "./TestUtils.js";

describe("GIVEN a program containing statements", () => {
    describe("WHEN evaluating expression statements", () => {
        const data = assemble(`
            osr     / Non-MRI, also test lowercase
            TAD     / MRI without parameters
            TAD^2   / MRI in expression
            .&7
            +1      / Unary operators as statement
            -2
            "A      / ASCII operator as statement
        `);
        test("THEN they should generate their literal values", () => {
            expect(data.memory[0o200]).toEqual(0o7404);
            expect(data.memory[0o201]).toEqual(0o1000);
            expect(data.memory[0o202]).toEqual(0o2000);
            expect(data.memory[0o203]).toEqual(0o0003);
            expect(data.memory[0o204]).toEqual(0o0001);
            expect(data.memory[0o205]).toEqual(0o7776);
            expect(data.memory[0o206]).toEqual("A".charCodeAt(0) | 0o200);
        });
    });

    describe("WHEN an MRI creates a link and the target is present on the zero page", () => {
        const data = assemble(`
            PAGE 0
            TAD (1234)
            PAGE 1
            JMP 1234
            JMP [1234]
        `);
        test("THEN the zero page link should not be used (no optimization)", () => {
            expect(data.memory[0o000]).toEqual(0o1177);
            expect(data.memory[0o200]).toEqual(0o5777);
            expect(data.memory[0o201]).toEqual(0o5177);

            // links
            expect(data.memory[0o177]).toEqual(0o1234);
            expect(data.memory[0o377]).toEqual(0o1234);
        });
    });

    describe("WHEN evaluating assigned statements", () => {
        const data = assemble(`
                B, 0                / 200
                    CALLC           / 201
                C, 0                / 202
                    JMP I C         / 203
                CALLC=JMS I C
            `);
        test("THEN they should support MRIs", () => {
            expect(data.symbols["CALLC"]).toEqual(0o4602);
            expect(data.memory[0o201]).toEqual(0o4602);
            expect(data.memory[0o203]).toEqual(0o5602);
        });
    });

    describe("WHEN evaluating assigned statements with links before they appear", () => {
        const data = assemble(`
                CALLX
                TAD 1235
                CALLX=JMS 1234
            `);
        test("THEN they should be linked correctly", () => {
            expect(data.symbols["CALLX"]).toEqual(0o4776);
            expect(data.memory[0o200]).toEqual(0o4776);
            expect(data.memory[0o201]).toEqual(0o1777);
            expect(data.memory[0o376]).toEqual(0o1234);
            expect(data.memory[0o377]).toEqual(0o1235);
        });
    });

    describe("WHEN evaluating assigned statements with links before they appear even in pass 2", () => {
        const data = assembleWithErrors(`
                CALLX
                CALLX=JMS X
                X=1234
            `);
        test("THEN they should be linked correctly", () => {
            // Note: PAL8 claims to assemble this without errors and even generates a listing with
            // CALLX pointing at a correct link - but that's only because the listing is generated in
            // *another* pass - the binary is in fact wrong and contains a zero at 0o200!
            expect(data.errors.length).toBeGreaterThan(0);
        });
    });

    describe("WHEN evaluating assignment statements with undefined right-hand sides", () => {
        const data = assemble(`
            A=B+2
            B=3
        `);
        test("THEN they should be defined in pass 2", () => {
            expect(data.symbols["A"]).toEqual(5);
        });
    });

    describe("WHEN using literals at page end", () => {
        const data = assemble(`
            *176
            TAD (1234)
        `);
        test("THEN assembling should output data and links without complaints", () => {
            expect(data.memory[0o0176]).toEqual(0o1177);
            expect(data.memory[0o0177]).toEqual(0o1234);
        });
    });

    describe("WHEN overlapping data and links", () => {
        describe("WHEN a single instruction is used", () => {
            const data = assembleWithErrors(`
                *177
                TAD (1234)
            `);

            test("THEN assembling should fail", () => {
                expect(data.errors.length).toBeGreaterThan(0);
            });
        });

        describe("WHEN a multi-word data instruction spanning two pages is used", () => {
            const data = assembleWithErrors(`
                TAD (1234)      / 0201: Generates link in 0377
                ZBLOCK 200      / Overlaps with 0377
            `);

            test("THEN assembling should fail", () => {
                expect(data.errors.length).toBeGreaterThan(0);
            });
        });

        describe("WHEN a multi-word data instruction spanning multiple pages is used", () => {
            const data = assembleWithErrors(`
                PAGE 3
                TAD (123)

                PAGE 1
                ZBLOCK 600      / Fills pages 1, 2, 3

            `);

            test("THEN assembling should fail", () => {
                expect(data.errors.length).toBeGreaterThan(0);
            });
        });
    });

    describe("WHEN the input contains anything after the $ statement", () => {
        const data = assemble(`
            NOP
            $
            TAD
            This is a test {}[]"!"
        `);
        test("THEN it should be ignored", () => {
            expect(data.memory[0o201]).toBeUndefined();
        });
    });

    describe("WHEN the input contains a TAD with an immediate MRI", () => {
        const data = assemble(`
            TAD (JMP I 234)
            TAD I [7600]
        `);
        test("THEN it should generate the MRI in a link and use it as operand", () => {
            expect(data.memory[0o200]).toEqual(0o1377);
            expect(data.memory[0o201]).toEqual(0o1577);
            expect(data.memory[0o177]).toEqual(0o7600);
            expect(data.memory[0o377]).toEqual(0o5634);
        });
    });

    describe("WHEN the input contains a TAD with a misplaced I", () => {
        const data = assemble(`
            JMP I 100
            JMP 100 I / Interpreted as JMP 500 -> off page
        `);
        test("THEN it should generate the MRI in a link and use it as operand", () => {
            expect(data.memory[0o200]).toEqual(0o5500);
            expect(data.memory[0o201]).toEqual(0o5777);
            expect(data.memory[0o377]).toEqual(0o0500);
        });
    });

    describe("WHEN the input contains multiple fields with link tables", () => {
        const data = assemble(`
            PAGE 2
            TAD (10     / Creates link in 00777

            FIELD 3
            PAGE 2
            TAD (20     / Creates link in 40777

            FIELD 0
            *610
            TAD (30     / Must create link 00777 again
        `);
        test("THEN it should forget all links after switching back to a previous field", () => {
            expect(data.memory[0o0777]).toEqual(0o30);
        });
    });

    describe("WHEN an assignment contains a literal", () => {
        const data = assemble(`
            A=(7)
        `);
        test("THEN it should generate a link and assign the address", () => {
            expect(data.symbols["A"]).toEqual(0o0377);
            expect(data.memory[0o0377]).toEqual(7);
        });
    });

    describe("WHEN a statement expressions is a paren expr", () => {
        const data = assemble(`
            (1234)
        `);
        test("THEN the statement should generate a link", () => {
            expect(data.memory[0o200]).equals(0o0377);
            expect(data.memory[0o377]).equals(0o1234);
        });
    });
});
