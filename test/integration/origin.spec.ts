import { assemble } from "./TestUtils.js";

// eslint-disable-next-line max-lines-per-function
describe("GIVEN a program with origin statements", () => {
    describe("WHEN evaluating the origin statement", () => {
        const data = assemble(`
            A=.
            *1234; B=.
            *100+20+4; C=.
        `);
        test("THEN it should affect the CLC operator", () => {
            expect(data.symbols["A"]).toEqual(0o200);
            expect(data.symbols["B"]).toEqual(0o1234);
            expect(data.symbols["C"]).toEqual(0o124);
        });
    });

    describe("WHEN evaluating consecutive origins", () => {
        const data = assemble(`
            *200
            TAD
            *201
            TAD
            *202
            TAD
        `);
        test("THEN it should still emit all of them", () => {
            expect(data.orgs).includes(0o200);
            expect(data.orgs).includes(0o201);
            expect(data.orgs).includes(0o202);
        });
    });

    describe("WHEN evaluating pseudos that use parenthesed arguments", () => {
        const data = assemble(`
                ZBLOCK [1   // generates link at 0177 -> effect ZBLOCK 177
                NOP
            `);
        test("THEN they should be linked correctly", () => {
            expect(data.memory[0o200]).toEqual(0);
            expect(data.memory[0o376]).toEqual(0);
            expect(data.memory[0o377]).toEqual(0o7000);

            expect(data.memory[0o177]).toEqual(0o1);
        });
    });
});
