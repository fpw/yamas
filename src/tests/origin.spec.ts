import { assemble } from "./util";

describe("GIVEN an assembler", () => {
    describe("WHEN evaluating the origin statement", () => {
        const data = assemble(`
            A=.
            *1234; B=.
            *100+20+4; C=.
        `);
        test("THEN it should behave as intended", () => {
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
});
