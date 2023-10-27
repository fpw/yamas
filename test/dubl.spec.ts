import { assemble } from "./util";

describe("GIVEN an assembler", () => {
    describe("WHEN evaluating DUBL statements", () => {
        const data = assemble(`
            *400
            DUBL    679467      / Example from page 6-2
                    44; -3      / of the MACRO-8 manual
                    +2;NOP
            TAG, CLA
        `);
        test("THEN they should generate signed 24 bit values", () => {
            expect(data.memory[0o400]).equals(0o0245);
            expect(data.memory[0o401]).equals(0o7053);

            expect(data.memory[0o402]).equals(0o0000);
            expect(data.memory[0o403]).equals(0o0054);

            expect(data.memory[0o404]).equals(0o7777);
            expect(data.memory[0o405]).equals(0o7775);

            expect(data.memory[0o406]).equals(0o0000);
            expect(data.memory[0o407]).equals(0o0002);

            expect(data.memory[0o410]).equals(0o7000);

            expect(data.symbols["TAG"]).equals(0o411);
        });
    });
});
