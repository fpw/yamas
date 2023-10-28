import { Assembler } from "./assembler/Assembler";
import { dumpNode } from "./parser/Node";
import { PreludeFamily8 } from "./prelude/Family8";
import { PreludeIO } from "./prelude/IO";
import { BinTapeWriter } from "./tapeformats/BinTapeWriter";

export interface Options {
    loadPrelude?: boolean;
    outputAst?: (inputName: string, line: string) => void;
};

export class Yamas {
    private asm = new Assembler();
    private opts: Options;
    private binTape = new BinTapeWriter();

    public constructor(opts: Options) {
        this.opts = opts;
        this.asm.setOutputHandler({
            changeField: field => this.binTape.writeField(field),
            changeOrigin: org => this.binTape.writeOrigin(org),
            writeValue: (_clc, val) => this.binTape.writeDataWord(val, true),
        });

        if (opts.loadPrelude) {
            this.asm.parseInput("prelude/family8.pa", PreludeFamily8);
            this.asm.parseInput("prelude/iot.pa", PreludeIO);
        }
    }

    public addInput(name: string, content: string) {
        const ast = this.asm.parseInput(name, content);
        if (this.opts.outputAst) {
            dumpNode(ast, line => this.opts.outputAst!(name, line));
        }
    }

    public run(): Uint8Array {
        this.asm.assembleAll();
        const bin = this.binTape.finish();
        return bin;
    }
}
