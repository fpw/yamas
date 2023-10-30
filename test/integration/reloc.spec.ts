/* eslint-disable max-lines-per-function */
import { dumpNode } from "../../src/parser/Node";
import { assemble, assembleWithErrors } from "./TestUtils";

describe("GIVEN a program containing reloc statements", () => {
    describe("WHEN assembling an example program with a RELOC", () => {
        const data = assemble(`
            *200
            RELOC 400
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
            RELOC

            FIELD 1
            FLD1,       TAD [2
                        CDF CIF 20
                        JMP FLD2

            FIELD 2
            FLD2,       TAD [3
                        CDF CIF 0
                        JMP START

        `);
        test("THEN the output should match the output of PAL8", () => {
            expect(data.memory[0o200]).toEqual(0o1212);
            expect(data.memory[0o201]).toEqual(0o1377);
            expect(data.memory[0o202]).toEqual(0o3212);
            expect(data.memory[0o203]).toEqual(0o5204);

            expect(data.memory[0o204]).toEqual(0o1212);
            expect(data.memory[0o205]).toEqual(0o1377);
            expect(data.memory[0o206]).toEqual(0o1177);
            expect(data.memory[0o207]).toEqual(0o3212);
            expect(data.memory[0o210]).toEqual(0o6213);
            expect(data.memory[0o211]).toEqual(0o5776);
            expect(data.memory[0o212]).toEqual(0o0000);

            expect(data.memory[0o10200]).toEqual(0o1177);
            expect(data.memory[0o10201]).toEqual(0o6223);
            expect(data.memory[0o10202]).toEqual(0o5200);

            expect(data.memory[0o20200]).toEqual(0o1177);
            expect(data.memory[0o20201]).toEqual(0o6203);
            expect(data.memory[0o20202]).toEqual(0o5777);

            // links
            expect(data.memory[0o177]).toEqual(0o0002);
            expect(data.memory[0o376]).toEqual(0o0200);
            expect(data.memory[0o377]).toEqual(0o0003);
            expect(data.memory[0o10177]).toEqual(0o0002);
            expect(data.memory[0o20177]).toEqual(0o0003);
            expect(data.memory[0o20377]).toEqual(0o0400);

            // Dumping a complex AST should not crash
            let ast = "";
            dumpNode(data.ast, line => ast += line + "\n");
            expect(ast.length).toBeGreaterThan(0);
        });
    });

    describe("WHEN assembling an example program with a RELOC that causes the link table to move mid-page", () => {
        const data = assembleWithErrors(`
            *200
            RELOC 410
            TAD (3
        `);
        test("THEN assembling should fail", () => {
            expect(data.errors.length).toBeGreaterThan(0);
        });
    });
});
