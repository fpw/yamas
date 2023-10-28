/* eslint-disable max-lines-per-function */
import { Assembler } from "../src/assembler/Assembler";
import { assemble } from "./util";

describe("GIVEN an assembler", () => {
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

    describe("WHEN a MRI creates a link and the target is present on the zero page", () => {
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
        const asm = new Assembler();
        asm.parseInput("test.pa", `
            / We have no prelude in this test
            TAD=1000
            FIXTAB
            *177
            TAD (1234)
        `);
        test("THEN assembling should fail", () => {
            expect(() => asm.assembleAll()).toThrow();
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

    describe("WHEN the input contains a TAD with an immediate unary", () => {
        const data = assemble(`
            TAD (-CDF 0)
            TAD (-CDF 5)
        `);
        test("THEN it should generate the MRI in a link and use it as operand", () => {
            expect(data.memory[0o200]).toEqual(0o1377);
            expect(data.memory[0o201]).toEqual(0o1377);
            expect(data.memory[0o377]).toEqual(0o1577);
        });
    });
});
