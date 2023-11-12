/* eslint-disable max-lines-per-function */
import { assemble, assembleWithErrors } from "./TestUtils.js";

describe("GIVEN a program with macros", () => {
    describe("WHEN evaluating macros with strange arguments", () => {
        const data = assemble(`
            DEFINE ADD A B <
                CLA
                TAD A
                TAD B
            >

            *200
            ADD (1000), I C
            C=321
        `);
        test("THEN they should assemble like a literal text replacement", () => {
            expect(data.memory[0o200]).toEqual(0o7200);

            // must put an immediate 1000 into last address of current page
            expect(data.memory[0o377]).toEqual(0o1000);
            // and reference it in A
            expect(data.memory[0o201]).toEqual(0o1377);
            // while B is an MRI
            expect(data.memory[0o202]).toEqual(0o1721);
        });
    });

    describe("WHEN evaluating macros containing pseudos", () => {
        const data = assemble(`
            DEFINE FIX1 A<
                FIXMRI A
            >
            DEFINE FIX2 A B<
                FIXMRI A=B
            >
            FIX1 OP1=5000
            FIX2 OP2, 5000
            OP1 I 234
            OP2 I 235
        `);
        test("THEN they should assemble as if the appeared at invocation time", () => {
            expect(data.memory[0o200]).toEqual(0o5634);
            expect(data.memory[0o201]).toEqual(0o5635);
        });
    });

    describe("WHEN the invocation causes parser errors", () => {
        const data = assembleWithErrors(`
            DEFINE FAIL X <
                TAD X
            >
            FAIL !          / Invocation has operand in element position
        `);
        test("THEN assembling should fail", () => {
            expect(data.errors.length).toBeGreaterThan(0);
        });
    });

    describe("WHEN the invocation causes assembler errors", () => {
        const data = assembleWithErrors(`
            DEFINE FAIL X <
                TAD X
            >
            FAIL I 1234     / Invocation causes double indirection
        `);
        test("THEN assembling should fail", () => {
            expect(data.errors.length).toBeGreaterThan(0);
        });
    });

});
