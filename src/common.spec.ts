import { asciiCharTo6Bit, dec6BitToAscii } from "./common";

describe("Converting ASCII and 6 bit", () => {
    const expectations: [string, number][] = [
        ["\0", 0o00],
        ["A", 0o01], ["Z", 0o32],
        ["[", 0o33], ["_", 0o37],
        [" ", 0o40], ["/", 0o57],
        ["0", 0o60], ["9", 0o71],
        [":", 0o72], ["?", 0o77],
    ];

    it("should work forwards", () => {
        for (const [ascii, dec] of expectations) {
            expect(asciiCharTo6Bit(ascii)).toEqual(dec);
        }
    });

    it("should work backwards", () => {
        for (const [ascii, dec] of expectations) {
            expect(dec6BitToAscii(dec)).toEqual(ascii);
        }
    });
});
