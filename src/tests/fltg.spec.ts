/* eslint-disable max-lines-per-function */
import { fromDecFloat } from "../common";
import { assemble } from "./util";

describe("GIVEN an assembler", () => {
    describe("WHEN evaluating FLTG statements", () => {
        const data = assemble(`
            *400
            FLTG    +509.32E-02 / Example from page 6-3
                    -62.97E04   / of the MACRO-8 manual
                    1.00E-2
                    0E0
                    1
                    .1
            TAG, CLA
        `);
        test("THEN they should behave as intended", () => {
            expect(data.symbols["TAG"]).equals(0o422);

            // the original MACRO-8 (dec-08-cma1-pb) generates slightly different,
            // but less accurate values that don't even match the
            // examples from the FPP manual, that's why we're accepting our better results

            expect(data.memory[0o400]).equals(0o0003);
            expect(data.memory[0o401]).equals(0o2427);
            expect(data.memory[0o402]).equals(0o6677); // MACRO-8 generates 6670
            expect(fromDecFloat(0o0003, 0o2427, 0o6677)).toBeCloseTo(509.32e-02, 6);

            expect(data.memory[0o403]).equals(0o0024);
            expect(data.memory[0o404]).equals(0o5462);
            expect(data.memory[0o405]).equals(0o0740);
            expect(fromDecFloat(0o0024, 0o5462, 0o0740)).toBeCloseTo(-62.97E04, 6);

            expect(data.memory[0o406]).equals(0o7772);
            expect(data.memory[0o407]).equals(0o2436);
            expect(data.memory[0o410]).equals(0o5605); // MACRO-8 generates 5576
            expect(fromDecFloat(0o7772, 0o2436, 0o5605)).toBeCloseTo(1e-2, 6);

            expect(data.memory[0o411]).equals(0o0000);
            expect(data.memory[0o412]).equals(0o0000);
            expect(data.memory[0o413]).equals(0o0000);
            expect(fromDecFloat(0o0000, 0o0000, 0o0000)).toBeCloseTo(0, 6);

            expect(data.memory[0o414]).equals(0o0001);
            expect(data.memory[0o415]).equals(0o2000);
            expect(data.memory[0o416]).equals(0o0000);
            expect(fromDecFloat(0o0001, 0o2000, 0o0000)).toBeCloseTo(1, 6);

            expect(data.memory[0o417]).equals(0o7775);
            expect(data.memory[0o420]).equals(0o3146);
            expect(data.memory[0o421]).equals(0o3146); // MACRO-8 generates 3144
            expect(fromDecFloat(0o7775, 0o3146, 0o3146)).toBeCloseTo(0.1, 6);
        });
    });
});
