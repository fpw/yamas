import {asciiCharToDec, decCharToAscii} from "../../src/utils/CharSets";
import {replaceBlanks} from "../../src/utils/Strings";

describe("WHEN converting character sets", () => {
    const expectations: [string, number][] = [
        ["\0", 0o00],
        ["A", 0o01], ["Z", 0o32],
        ["[", 0o33], ["_", 0o37],
        [" ", 0o40], ["/", 0o57],
        ["0", 0o60], ["9", 0o71],
        [":", 0o72], ["?", 0o77],
    ];

    for (const [ascii, dec] of expectations) {
        describe(`GIVEN the ASCII character '${replaceBlanks(ascii)}'`, () => {
            test("THEN it should convert to 6-bit correctly", () => {
                expect(asciiCharToDec(ascii)).toEqual(dec);
            });
        });

        describe(`GIVEN the 6-bit character ${dec}`, () => {
            test("THEN it should convert to ASCII correctly", () => {
                expect(decCharToAscii(dec)).toEqual(ascii);
            });
        });
    }
});
