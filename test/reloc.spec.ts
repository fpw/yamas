/* eslint-disable max-lines-per-function */
import { dumpNode } from "../src/parser/Node";
import { assemble } from "./util";

describe("GIVEN an assembler", () => {
    describe("WHEN assembling an example program with a RELOC", () => {
        const data = assemble(`
            *200
            RELOC 410
            START,      TAD B
                        TAD (3
                        DCA LINK
                        JMP P2
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
            expect(data.memory[0o200]).toEqual(0o1222);
            expect(data.memory[0o201]).toEqual(0o1377);
            expect(data.memory[0o202]).toEqual(0o3222);
            expect(data.memory[0o203]).toEqual(0o5214);

            expect(data.memory[0o204]).toEqual(0o1222);
            expect(data.memory[0o205]).toEqual(0o1377);
            expect(data.memory[0o206]).toEqual(0o1177);
            expect(data.memory[0o207]).toEqual(0o3222);
            expect(data.memory[0o210]).toEqual(0o6213);
            expect(data.memory[0o211]).toEqual(0o5210);
            expect(data.memory[0o212]).toEqual(0o0000);

            expect(data.memory[0o10200]).toEqual(0o1177);
            expect(data.memory[0o10201]).toEqual(0o6223);
            expect(data.memory[0o10202]).toEqual(0o5210);

            expect(data.memory[0o20200]).toEqual(0o1177);
            expect(data.memory[0o20201]).toEqual(0o6203);
            expect(data.memory[0o20202]).toEqual(0o5210);

            // links
            expect(data.memory[0o177]).toEqual(0o0002);
            expect(data.memory[0o377]).toEqual(0o0003);
            expect(data.memory[0o10177]).toEqual(0o0002);
            expect(data.memory[0o20177]).toEqual(0o0003);

            // Dumping a complex AST should not crash
            let ast = "";
            dumpNode(data.ast, line => ast += line + "\n");
            expect(ast.length).toBeGreaterThan(0);
        });
    });
});
