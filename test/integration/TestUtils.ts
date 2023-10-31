/* eslint-disable max-lines-per-function */
import { Assembler } from "../../src/assembler/Assembler.js";
import { Program } from "../../src/parser/Node.js";
import { PreludeFamily8 } from "../../src/prelude/Family8.js";
import { PreludeIO } from "../../src/prelude/IO.js";
import { Prelude8E } from "../../src/prelude/PDP8E.js";
import { CodeError } from "../../src/utils/CodeError.js";

export interface TestData {
    asm: Assembler;
    errors: CodeError[];
    ast: Program;
    symbols: Record<string, number>;
    memory: number[];
    orgs: number[];
}

export function assemble(input: string): TestData {
    const data = assembleWithErrors(input);
    if (data.errors.length > 0) {
        throw data.errors[0];
    }
    return data;
}

export function assembleWithErrors(input: string): TestData {
    const memory: number[] = [];
    const orgs: number[] = [];
    const asm = new Assembler({});
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

    return { asm, errors, ast, symbols, orgs, memory };
}
