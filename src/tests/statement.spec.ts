/* eslint-disable max-lines-per-function */
import { assemble } from "./util";

describe("GIVEN an assembler", () => {
    describe("WHEN evaluating expression statements", () => {
        const data = assemble(`
            OSR
            TAD
            TAD^2
        `);
        test("THEN they should behave as intended", () => {
            expect(data.memory[0o200]).toEqual(0o7404);
            expect(data.memory[0o201]).toEqual(0o1000);
            expect(data.memory[0o202]).toEqual(0o2000);
        });
    });

    describe("WHEN evaluating assigned statements", () => {
        const data = assemble(`
            CALLC=JMS I C
            B, 0                / 200
                CALLC           / 201
            C, 0                / 202
                JMP I C         / 203
        `);
        test("THEN they should behave as intended", () => {
            expect(data.symbols["CALLC"]).toEqual(0o4602);
            expect(data.memory[0o201]).toEqual(0o4602);
        });
    });

    describe("WHEN evaluating assignment statements with undefined right-hand sides", () => {
        const data = assemble(`
            A=B+2
            B=3
        `);
        test("THEN they should behave as intended", () => {
            expect(data.symbols["A"]).toEqual(5);
        });
    });
});
