import { assemble } from "./util";

describe("GIVEN an assembler", () => {
    describe("WHEN evaluating FLTG statements", () => {
        const data = assemble(`
            *400
            FLTG    +509.32E-02 / Example from page 6-3
                    -62.97E04   / of the MACRO-8 manual
                    1.00E-2
                    0E0
            TAG, CLA
        `);
        test("THEN they should behave as intended", () => {
            expect(data.symbols["TAG"]).equals(0o414);

            expect(data.memory[0o400]).equals(0o0003);
            expect(data.memory[0o401]).equals(0o2427);
            expect(data.memory[0o402]).equals(0o6674);

            expect(data.memory[0o403]).equals(0o0024);
            expect(data.memory[0o404]).equals(0o5462);
            expect(data.memory[0o405]).equals(0o0740);

            expect(data.memory[0o406]).equals(0o7772);
            expect(data.memory[0o407]).equals(0o2436);
            expect(data.memory[0o410]).equals(0o5604);

            expect(data.memory[0o411]).equals(0o7775);
            expect(data.memory[0o412]).equals(0o0000);
            expect(data.memory[0o413]).equals(0o0000);

        });
    });
});
