/* eslint-disable max-lines-per-function */
import { Assembler } from "../../src/assembler/Assembler";
import { Program } from "../../src/parser/Node";
import { PreludeFamily8 } from "../../src/prelude/Family8";
import { PreludeIO } from "../../src/prelude/IO";
import { Prelude8E } from "../../src/prelude/PDP8E";
import { CodeError } from "../../src/utils/CodeError";

export interface TestData {
    asm: Assembler;
    errors: CodeError[];
    ast: Program;
    symbols: Record<string, number>;
    memory: number[];
    orgs: number[];
}

export function assemble(input: string): TestData {
    const memory: number[] = [];
    const orgs: number[] = [];
    const asm = new Assembler();
    let field = 0;

    asm.setOutputHandler({
        changeField(f) {
            field = f;
        },
        changeOrigin(clc) {
            orgs.push(clc);
        },
        writeValue(clc, val) {
            memory[field * 4096 + clc] = val;
        },
    });

    asm.parseInput("prelude/family8.pa", PreludeFamily8);
    asm.parseInput("prelude/iot.pa", PreludeIO);
    asm.parseInput("prelude/pdp8e.pa", Prelude8E);

    const ast = asm.parseInput("test.pa", input);
    const errors = asm.assembleAll();

    const symbols: Record<string, number> = {};
    asm.getSymbols().forEach(sym => symbols[sym.name] = sym.value);

    return {asm, errors, ast, symbols, orgs, memory};
}
