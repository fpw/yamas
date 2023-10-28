/* eslint-disable max-lines-per-function */
import { Assembler } from "../src/assembler/Assembler";
import { Program } from "../src/parser/Node";
import { PreludeFamily8 } from "../src/prelude/Family8";
import { PreludeIO } from "../src/prelude/IO";

export interface TestData {
    asm: Assembler;
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
    })

    asm.parseInput("prelude/family8.pa", PreludeFamily8);
    asm.parseInput("prelude/iot.pa", PreludeIO);

    const ast = asm.parseInput("test.pa", input);
    asm.assembleAll();

    const symbols: Record<string, number> = {};
    asm.getSymbols().forEach(sym => symbols[sym.name] = sym.value);

    return {asm, ast, symbols, orgs, memory};
}
