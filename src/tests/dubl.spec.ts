import { assemble } from "./util";

describe("GIVEN an assembler", () => {
    describe("WHEN evaluating DUBL statements", () => {
        const data = assemble(`
            *400
            DUBL    679467      / Example from page 6-2
                    44; -3      / of the MACRO-8 manual
                    +2
            TAG, CLA
        `);
        test("THEN they should behave as intended", () => {
            expect(data.symbols["TAG"]).equals(0o410);

            expect(data.memory[0o400]).equals(0o0245);
            expect(data.memory[0o401]).equals(0o7053);

            expect(data.memory[0o402]).equals(0o0000);
            expect(data.memory[0o403]).equals(0o0054);
        });
    });
});
