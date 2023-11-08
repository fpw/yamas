import { BinTapeReader } from "../../../src/tapeformats/BinTapeReader.js";
import { BinTapeWriter } from "../../../src/tapeformats/BinTapeWriter.js";

describe("GIVEN a binary tape", () => {
    const writer = new BinTapeWriter();
    describe("WHEN we fill it with some data", () => {
        writer.writeOrigin(0o200);
        writer.writeDataWord(1);
        writer.writeDataWord(2);
        writer.writeOrigin(0o200);
        writer.writeDataWord(3);
        writer.writeField(1);
        writer.writeOrigin(0o200);
        writer.writeDataWord(4);
        const tape = writer.finish();

        test("THEN reading it back should yield the correct state", () => {
            const reader = new BinTapeReader(tape);
            const data = reader.read();
            expect(data[0o00200]).toEqual(3);
            expect(data[0o00201]).toEqual(2);
            expect(data[0o10200]).toEqual(4);
        });
    });
});
