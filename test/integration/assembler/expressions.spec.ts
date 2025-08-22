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
            expect(data.symbols.A).toEqual(7);
            expect(data.symbols.B).toEqual(36);
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
            expect(data.symbols.A).toEqual(10);
            expect(data.symbols.B).toEqual(-23 & 0o7777);
            expect(data.symbols.C).toEqual(-8 & 0o7777);
        });
    });

    describe("WHEN evaluating the ASCII operator", () => {
        const data = assemble(`
            OUT="A
        `);
        test("THEN it should generate mark parity", () => {
            expect(data.symbols.OUT).toEqual("A".charCodeAt(0) | 0o200);
        });
    });

    describe("WHEN evaluating the division operator", () => {
        const data = assemble(`
            A=-1000%1000    / -1000 is 7000 unsigned
            B=123%0         / as per PAL8: division by zero is zero
        `);
        test("THEN it should behave as specified", () => {
            expect(data.symbols.A).toEqual(7);
            expect(data.symbols.B).toEqual(0);
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
            expect(data.symbols.A).toEqual(0o0376);
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

    describe("WHEN an origin uses CLC in a symbol group", () => {
        const data = assemble(`
            *220
            *.-1 177+1      / 217 or 177 = 377, +1 = 400. Parse as BinOp(CLC, -, Group(1 177+1))
            TAG,
        `);
        test("THEN it OR the operands as expected", () => {
            expect(data.symbols.TAG).toEqual(0o0400);
        });
    });

    describe("WHEN an operator joins a parentheses expression", () => {
        const data = assemble(`
            A=(0+(1+(2
        `);
        test("THEN it should generate links and use the operator on them", () => {
            expect(data.memory[0o375]).toEqual(0o0376);
            expect(data.memory[0o376]).toEqual(0o0400);
            expect(data.memory[0o377]).toEqual(0o0002);
            expect(data.symbols.A).toEqual(0o0375);
        });
    });

    describe("WHEN an expression generates a link to a symbol that is defined later with a different link", () => {
        const data = assemble(`
            /                         Loc   Pass 1              Pass 2
            JMP I [A                / 200,  link: 177=0         link 177=1
            LPUSHF                  / 201,  do nothing          use value -> 4576
            JMP I [B                / 202,  177=0               link 176=2
            MPUSHF, NOP             / 203,  normal              normal
            LPUSHF= JMS I [MPUSHF   /       link 176=203        link 175=203
            A=1
            B=2
        `);
        test("THEN the generated code is invalid", () => {
            expect(data.memory[0o0175]).equals(0o0203);
            expect(data.memory[0o0176]).equals(0o0002);
            expect(data.memory[0o0177]).equals(0o0001);

            expect(data.memory[0o0200]).equals(0o5577);

            // Note: PAL8 claims to assemble this without errors and even generates a listing with
            // LPUSHF pointing at a correct link here - but that's only because the listing is generated in
            // *another* pass - the binary is in fact wrong and contains an invalid link!
            expect(data.memory[0o0201]).equals(0o4576);

            expect(data.memory[0o0202]).equals(0o5576);
            expect(data.memory[0o0203]).equals(0o7000);
        });
    });
});
