/* eslint-disable max-lines-per-function */
import { Assembler } from "../assembler/Assembler";
import { assemble } from "./util";

describe("GIVEN an assembler", () => {
    describe("WHEN evaluating binary operators", () => {
        const data = assemble(`
            DECIMAL
            A=20-10-3
            B=10+2^3
        `);
        test("THEN they should be left-associative", () => {
            expect(data.symbols["A"]).toEqual(7);
            expect(data.symbols["B"]).toEqual(36);
        });
    });

    describe("WHEN evaluating unary operators", () => {
        const data = assemble(`
            DECIMAL
            A=+10
            B=-23
            C=2^-4
        `);
        test("THEN they should be correct", () => {
            expect(data.symbols["A"]).toEqual(10);
            expect(data.symbols["B"]).toEqual(-23 & 0o7777);
            expect(data.symbols["C"]).toEqual(-8 & 0o7777);
        });
    });

    describe("WHEN evaluating the ASCII operator", () => {
        const data = assemble(`
            OUT="A
        `);
        test("THEN it should generate mark parity", () => {
            expect(data.symbols["OUT"]).toEqual("A".charCodeAt(0) | 0o200);
        });
    });

    describe("WHEN accessing undefined symbols", () => {
        const asm = new Assembler();
        asm.parseInput("test.pa", `
            IFNDEF A <GLITCH>
        `);
        test("THEN it should generate an error", () => {
            expect(() => asm.assembleAll()).toThrow();
        });
    });
});
