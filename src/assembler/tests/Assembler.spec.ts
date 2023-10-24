import { Assembler } from "../Assembler";

describe("Assemling simple statements", () => {
    it("should handle origin", () => {
        const asm = new Assembler();
        asm.parseInput("test.pa", `
            A=.
            *1234; B=.
            *100+20+4; C=.
        `);
        asm.assembleAll();
        expect(getSymbol(asm, "A")).toEqual(0o200);
        expect(getSymbol(asm, "B")).toEqual(0o1234);
        expect(getSymbol(asm, "C")).toEqual(0o124);
    });
});

describe("Assemling expressions", () => {
    it("should be left-associative", () => {
        const asm = new Assembler();
        asm.parseInput("test.pa", `
            DECIMAL
            A=20-10-3
            B=10+2^3
        `);
        asm.assembleAll();
        expect(getSymbol(asm, "A")).toEqual(7);
        expect(getSymbol(asm, "B")).toEqual(36);
    });
});

describe("Assemling pseudeos", () => {
    it("should handle TEXT", () => {
        const asm = new Assembler();
        asm.parseInput("test.pa", `
            *0
            TEXT "Hello" / Odd length -> null termination in last symbol
            A=.
            *0
            TEXT "World!" / Even length -> must add word for null termination
            B=.
        `);
        asm.assembleAll();
        expect(getSymbol(asm, "A")).toEqual(3);
        expect(getSymbol(asm, "B")).toEqual(4);
    });
});

describe("Assembling regression examples", () => {
    it("should allow macro bodies without blanks", () => {
        const asm = new Assembler();
        asm.parseInput("test.pa", `
            IFZERO 0<A=1>
        `);
        asm.assembleAll();
        expect(getSymbol(asm, "A")).toEqual(1);
    });

    it("allow undefined symbols if defined later", () => {
        const asm = new Assembler();
        asm.parseInput("test.pa", `
            IFNZRO B <A=1>
            C=B+1
            B=1
        `);
        asm.assembleAll();
        expect(getSymbol(asm, "A")).toEqual(1);
        expect(getSymbol(asm, "C")).toEqual(2);
    });
});

function getSymbol(asm: Assembler, name: string) {
    const symbols = asm.getSymbols();
    for (const symb of symbols) {
        if (symb.name == name) {
            return symb.value;
        }
    }
    throw Error(`Symbol ${name} not defined`);
}

/**
 * Useful tests:
 * TAD = 1000
 * TAD^2 = 2000
 *
 */
