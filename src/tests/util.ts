import { Assembler } from "../assembler/Assembler";
import { PreludeEAE } from "../prelude/EAE";
import { PreludeFamily8 } from "../prelude/Family8";
import { PreludeIO } from "../prelude/IO";

export interface TestData {
    asm: Assembler;
    symbols: Record<string, number>;
    memory: number[];
    orgs: number[];
}

export function assemble(input: string): TestData {
    const memory: number[] = [];
    const orgs: number[] = [];
    const asm = new Assembler();
    let field = 0;
    let enabled = true;

    asm.setOutputHandler({
        changeField(f) {
            field = f;
        },
        changeOrigin(clc) {
            orgs.push(clc);
        },
        setEnable(e) {
            enabled = e;
        },
        writeValue(clc, val) {
            memory[field * 4096 + clc] = val;
        },
    })

    asm.parseInput("prelude/family8.pa", PreludeFamily8);
    asm.parseInput("prelude/iot.pa", PreludeIO);
    asm.parseInput("prelude/eae.pa", PreludeEAE);

    asm.parseInput("test.pa", input);
    asm.assembleAll();

    const symbols: Record<string, number> = {};
    asm.getSymbols().forEach(sym => symbols[sym.name] = sym.value);

    return {asm, symbols, orgs, memory};
}
