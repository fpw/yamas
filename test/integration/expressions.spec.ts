/* eslint-disable max-lines-per-function */
import { assemble, assembleWithErrors } from "./TestUtils.js";

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

    describe("WHEN evaluating the division operator", () => {
        const data = assemble(`
            A=-1000%1000    / -1000 is 7000 unsigned
            B=123%0         / as per PAL8: division by zero is zero
        `);
        test("THEN it should behave as specified", () => {
            expect(data.symbols["A"]).toEqual(7);
            expect(data.symbols["B"]).toEqual(0);
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

    describe("WHEN an expression nests parentheses", () => {
        const data = assemble(`
            A=((7))
        `);
        test("THEN it should generate a link to a link", () => {
            expect(data.symbols["A"]).toEqual(0o0376);
            expect(data.memory[0o0376]).toEqual(0o377);
            expect(data.memory[0o0377]).toEqual(7);
        });
    });

    describe("WHEN the input contains a TAD with an immediate unary", () => {
        const data = assemble(`
            TAD (-CDF  0)
            TAD (-CDF  1234  ) / Syntax variation with spaces
            TAD (-TAD)
        `);
        test("THEN it should generate the MRI in a link and use it as operand", () => {
            expect(data.memory[0o200]).toEqual(0o1377);
            expect(data.memory[0o201]).toEqual(0o1376);
            expect(data.memory[0o202]).toEqual(0o1375);

            expect(data.memory[0o375]).toEqual(0o7000);
            expect(data.memory[0o376]).toEqual(0o1777);
            expect(data.memory[0o377]).toEqual(0o1577);
        });
    });

    describe("WHEN the input contains a TAD with an immediate MRI unary", () => {
        const data = assembleWithErrors(`
            TAD (-TAD 2)
        `);
        test("THEN it should fail", () => {
            expect(data.errors.length).toBeGreaterThan(0);
        });
    });

    describe("WHEN the input contains a TAD with a symbol group", () => {
        const data = assemble(`
            TAD (1 3)
        `);
        test("THEN it should fail", () => {
            expect(data.memory[0o200]).toEqual(0o1377);
            expect(data.memory[0o377]).toEqual(0o0003);
        });
    });
});
