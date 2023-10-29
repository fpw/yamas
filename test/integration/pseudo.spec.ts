/* eslint-disable max-lines-per-function */
import { decStringToAscii, os8NameToASCII } from "../../src/utils/CharSets";
import { assemble } from "./TestUtils";

describe("GIVEN a program containing pseudo statements", () => {
    describe("WHEN evaluating PAGE statements with parameters", () => {
        const data = assemble(`
            PAGE 0
            A=.
            PAGE 37
            B=.
        `);
        test("THEN they should set the CLC properly", () => {
            expect(data.symbols["A"]).toEqual(0o0000);
            expect(data.symbols["B"]).toEqual(0o7600);
        });
    });

    describe("WHEN evaluating the PAGE statement on page boundaries", () => {
        const data = assemble(`
            *177
            PAGE
            A=.
            PAGE / Verified against dec-08-cma1-pb
            B=.
            *576
            HLT
            PAGE
            C=.
        `);
        test("THEN the effect should depend on the CLC", () => {
            expect(data.symbols["A"]).toEqual(0o200);
            expect(data.symbols["B"]).toEqual(0o200);
            expect(data.symbols["C"]).toEqual(0o600);
        });
    });

    describe("WHEN using OCTAL and DECIMAL", () => {
        const data = assemble(`
            A=10
            DECIMAL
            B=10
            OCTAL
            C=10
        `);
        test("THEN literals should be read in the given radix", () => {
            expect(data.symbols["A"]).toEqual(0o10);
            expect(data.symbols["B"]).toEqual(10);
            expect(data.symbols["C"]).toEqual(0o10);
        });
    });

    describe("WHEN evaluating the FIXMRI statement", () => {
        const data = assemble(`
            FIXMRI OP=5000
            OP I 234
       `);
        test("THEN it should result in a fixed MRI", () => {
            expect(data.memory[0o200]).toEqual(0o5634);
        });
    });

    describe("WHEN using EXPUNGE", () => {
        const data = assemble(`
            A=10
            EXPUNGE
            IFNDEF A <B=1>
        `);
        test("THEN symbols should be deleted", () => {
            expect(data.symbols["B"]).toEqual(1);
        });
    });

    describe("WHEN using NOPUNCH and ENPUNCH", () => {
        const data = assemble(`
            1
            NOPUNCH
            2
            ENPUNCH
            3
        `);
        test("THEN output should be inhibited while addresses are still counted", () => {
            expect(data.memory[0o200]).toEqual(1);
            expect(data.memory[0o201]).toBeUndefined();
            expect(data.memory[0o202]).toEqual(3);
        });
    });

    describe("WHEN evaluating the TEXT statement", () => {
        const data = assemble(`
             *0
            TEXT "HELLO" / Odd length -> null termination in last symbol
            A=.

            TEXT "WORLD!" / Even length -> must add word for null termination
            B=.
       `);
        test("THEN it should generate a null terminator depending on the length", () => {
            expect(data.symbols["A"]).toEqual(3);
            expect(decStringToAscii([
                data.memory[0],
                data.memory[1],
                data.memory[2]
            ])).toEqual("HELLO");

            expect(data.symbols["B"]).toEqual(7);
            expect(decStringToAscii([
                data.memory[3],
                data.memory[4],
                data.memory[5],
                data.memory[6]
            ])).toEqual("WORLD!");
        });
    });

    describe("WHEN evaluating the TEXT inside a condition", () => {
        const data = assemble(`
            TAG1,
            IFZERO 0 <
                A, TEXT /HELLO!/
            >
            TAG2,
       `);
        test("THEN it should be conditionally generated", () => {
            expect(data.symbols["TAG2"] - data.symbols["TAG1"]).toEqual(4);
        });
    });

    describe("WHEN evaluating the ZBLOCK statement", () => {
        const data = assemble(`
            ZBLOCK 3
       `);
        test("THEN it should generate zeroes", () => {
            expect(data.memory[0o200]).toEqual(0o0000);
            expect(data.memory[0o201]).toEqual(0o0000);
            expect(data.memory[0o202]).toEqual(0o0000);
            expect(data.memory[0o203]).toBeUndefined();
        });
    });

    describe("WHEN evaluating the EJECT statement", () => {
        const data = assemble(`
            EJECT THIS IS A TEST STRING
       `);
        test("THEN it should ignore it", () => {
        });
    });
    describe("WHEN evaluating the FILENAME statement", () => {
        const data = assemble(`
            FILENAME PIP.SV
            TAG,
            FILENAME PIP
       `);
        test("THEN it should generate names according to spec", () => {
            // Spec: DEC-S8-OSSMB-A-D, page 1-7
            expect(data.symbols["TAG"]).toEqual(0o204);

            expect(data.memory[0o200]).toEqual(0o2011);
            expect(data.memory[0o201]).toEqual(0o2000);
            expect(data.memory[0o202]).toEqual(0o0000);
            expect(data.memory[0o203]).toEqual(0o2326);
            expect(os8NameToASCII([0o2011, 0o2000, 0o0000, 0o2326])).toEqual("PIP.SV");

            expect(data.memory[0o204]).toEqual(0o2011);
            expect(data.memory[0o205]).toEqual(0o2000);
            expect(data.memory[0o206]).toEqual(0o0000);
            expect(data.memory[0o207]).toEqual(0o0000);
            expect(os8NameToASCII([0o2011, 0o2000, 0o0000, 0o000])).toEqual("PIP");
        });
    });

    describe("WHEN evaluating the DEVICE statement", () => {
        const data = assemble(`
            DEVICE DTA1
            TAG,
       `);
        test("THEN it should generate names according to spec", () => {
            // Spec: DEC-S8-OSSMB-A-D, page 1-7
            expect(data.symbols["TAG"]).toEqual(0o202);

            expect(data.memory[0o200]).toEqual(0o0424);
            expect(data.memory[0o201]).toEqual(0o0161);
        });
    });
});
