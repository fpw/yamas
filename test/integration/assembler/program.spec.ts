/* eslint-disable max-lines-per-function */
import { dumpNode } from "../../../src/parser/Node.js";
import { assemble } from "./TestUtils.js";

describe("GIVEN a full example listing", () => {
    describe("WHEN assembling the example program", () => {
        const data = assemble(`
            / Example program from OS/8 System Reference Manual, page 95
            *200
            START,      TAD B
                        TAD (3
                        DCA LINK
                        JMP P2
            *400
            P2,         TAD LINK
                        TAD (3
                        TAD [2
                        DCA B
                        CDF CIF 10
                        JMP FLD1

            LINK,       0
            B=LINK

            FIELD 1
            FLD1,       TAD [2
                        CDF CIF 20
                        JMP FLD2

            FIELD 2
            FLD2,       TAD [3
                        CDF CIF 0
                        JMP START

        `);
        test("THEN the output should match the one on the manual page", () => {
            expect(data.memory[0o200]).toEqual(0o1777);
            expect(data.memory[0o201]).toEqual(0o1376);
            expect(data.memory[0o202]).toEqual(0o3777);
            expect(data.memory[0o203]).toEqual(0o5775);

            expect(data.memory[0o400]).toEqual(0o1206);
            expect(data.memory[0o401]).toEqual(0o1377);
            expect(data.memory[0o402]).toEqual(0o1177);
            expect(data.memory[0o403]).toEqual(0o3206);
            expect(data.memory[0o404]).toEqual(0o6213);
            expect(data.memory[0o405]).toEqual(0o5776);
            expect(data.memory[0o406]).toEqual(0o0000);

            expect(data.memory[0o10200]).toEqual(0o1177);
            expect(data.memory[0o10201]).toEqual(0o6223);
            expect(data.memory[0o10202]).toEqual(0o5200);

            expect(data.memory[0o20200]).toEqual(0o1177);
            expect(data.memory[0o20201]).toEqual(0o6203);
            expect(data.memory[0o20202]).toEqual(0o5200);

            // links
            expect(data.memory[0o177]).toEqual(0o0002);
            expect(data.memory[0o375]).toEqual(0o0400);
            expect(data.memory[0o376]).toEqual(0o0003);
            expect(data.memory[0o377]).toEqual(0o0406);
            expect(data.memory[0o576]).toEqual(0o0200);
            expect(data.memory[0o577]).toEqual(0o0003);
            expect(data.memory[0o10177]).toEqual(0o0002);
            expect(data.memory[0o20177]).toEqual(0o0003);

            // Dumping a complex AST should not crash
            let ast = "";
            dumpNode(data.ast, line => ast += line + "\n");
            expect(ast.length).toBeGreaterThan(0);
        });
    });
});
