/* eslint-disable max-lines-per-function */
import { assemble } from "./TestUtils";

describe("GIVEN a program with expressions", () => {
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

    describe("WHEN evaluating a symbol group followed by a binary op", () => {
        const data = assemble(`
            T=1600
            T 220-200 / Must evaluate as (1600 or 220) - 200
            T 220-200 7-1 / Must evaluate as ((((1600 or 220) - 200) or 7) - 1)
        `);
        test("THEN it should evaluate as left-associative OR", () => {
            expect(data.memory[0o200]).toEqual(0o1420);
            expect(data.memory[0o201]).toEqual(0o1426);
        });
    });
});
