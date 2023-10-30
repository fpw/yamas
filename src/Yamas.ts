import { Assembler, AssemblerOptions } from "./assembler/Assembler";
import { dumpNode } from "./parser/Node";
import { PreludeFamily8 } from "./prelude/Family8";
import { PreludeIO } from "./prelude/IO";
import { Prelude8E } from "./prelude/PDP8E";
import { BinTapeWriter } from "./tapeformats/BinTapeWriter";
import { CodeError } from "./utils/CodeError";

export interface YamasOptions {
    outputAst?: (inputName: string, line: string) => void;

    loadPrelude?: boolean;

    // to disable given pseudos, e.g. to assemble code that uses DEFINE as symbol
    disablePseudos?: string[];

    // Ideas:

    // implementation idea: keep an array of LinKTables in Assembler
    keepLinksInFieldSwitch?: boolean; // to not delete link table when switching fields
};

export class Yamas {
    private asm: Assembler;
    private opts: YamasOptions;
    private binTape = new BinTapeWriter();

    public constructor(opts: YamasOptions) {
        this.opts = opts;
        this.asm = new Assembler(this.convertOpts(opts));

        this.asm.setOutputHandler({
            changeField: field => this.binTape.writeField(field),
            changeOrigin: org => this.binTape.writeOrigin(org),
            writeValue: (_clc, val) => this.binTape.writeDataWord(val, true),
        });

        if (opts.loadPrelude) {
            this.asm.parseInput("prelude/family8.pa", PreludeFamily8);
            this.asm.parseInput("prelude/iot.pa", PreludeIO);
            this.asm.parseInput("prelude/pdp8e.pa", Prelude8E);
        }
    }

    public addInput(name: string, content: string) {
        const ast = this.asm.parseInput(name, content);
        if (this.opts.outputAst) {
            dumpNode(ast, line => this.opts.outputAst!(name, line));
        }
    }

    public run(): { binary: Uint8Array, errors: CodeError[] } {
        const errors = this.asm.assembleAll();
        const binary = this.binTape.finish();
        return { binary, errors };
    }

    private convertOpts(opts: YamasOptions): AssemblerOptions {
        return {
            disabledPseudos: opts.disablePseudos,
        };
    }
}
