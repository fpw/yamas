import { Assembler } from "./Assembler";

describe("Assemling simple examples", () => {
    const asm = new Assembler();

    it("should handle origin", () => {
        asm.addFile("test.pa", `
            / INTEGER SUMMATION SUBROUTINE
            *20
            TOTAL,  0
            INDEX,  0
            N,      0

            PAGE 1

            START,
                TAD (10)
                JMS INTSUM
                HLT

            PAGE 2

            INTSUM, 0           / SAVE PC HERE
                DCA N           / SAVE INPUT NUMBER
                DCA TOTAL       / ZERO TO SUM
                TAD N
            GO, DCA INDEX       / SET INDEX
                TAD TOTAL       / MAIN LOOP
                TAD INDEX
                DCA TOTAL
                STA; TAD INDEX  / INDEX - 1
                SZA             / IS IT 0?
                JMP GO          / NO: CONTINUE
                JMP I INTSUM    / YES: ALL DONE

            PAGE 3

            DEFINE MOVE A B <
                CLA
                TAD A
                DCA B
                TAD B
            > / No

            MOVE INDEX, N
            NOP

            `);
        asm.run();
        expect(1).toEqual(1);
    });
});

/**
 *
 * Useful tests:
 * IFNZRO 0<GLITCH>
 * IFNZRO 3-2-1 <GLITCH>
 * Using undefined symbols in IFZERO
 * Using undefined RHS in assignment
 * TAD = 1000
 * TAD^2 = 2000
 *
 */
