import { BinTapeReader, Yamas } from "../../../src/index.js";

describe("GIVEN an assembly listing", () => {
    const listing = "NOP";

    describe("WHEN assembled by Yamas", () => {
        const yamas = new Yamas({ loadPrelude: true });
        yamas.addInput("test.pa", listing);

        const out = yamas.run();

        test("THEN it should produce a valid binary tape", () => {
            const state = new BinTapeReader(out.binary).read();
            expect(out.errors.length).toBe(0);
            expect(state[0o200]).toEqual(0o7000);
        });
    });
});
