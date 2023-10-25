import { Assembler } from "../assembler/Assembler";
import { PreludeEAE } from "../prelude/EAE";
import { PreludeFamily8 } from "../prelude/Family8";
import { PreludeIO } from "../prelude/IO";

export function assemble(input: string): Assembler {
    const asm = new Assembler();

    asm.parseInput("prelude/family8.pa", PreludeFamily8);
    asm.parseInput("prelude/iot.pa", PreludeIO);
    asm.parseInput("prelude/eae.pa", PreludeEAE);

    asm.parseInput("test.pa", input);
    asm.assembleAll();

    return asm;
}

export function getSymbolValue(asm: Assembler, name: string) {
    const symbols = asm.getSymbols();
    for (const symb of symbols) {
        if (symb.name == name) {
            return symb.value;
        }
    }
    throw Error(`Symbol ${name} not defined`);
}
