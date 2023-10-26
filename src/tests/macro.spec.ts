/* eslint-disable max-lines-per-function */
import { assemble } from "./util";

describe("GIVEN an assembler", () => {
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
            // while B is a MRI
            expect(data.memory[0o202]).toEqual(0o1721);
        });
    });
});
