import { Assembler } from "./assembler/Assembler";
import { dumpNode } from "./parser/Node";
import { BinTape } from "./tapeformats/BinTape";

export interface Options {
    outputAst?: (inputName: string, line: string) => void;
    outputBin?: (byte: number) => void;
    outputSyms?: (line: string) => void;
};

export class Yamas {
    private asm = new Assembler();
    private opts: Options;
    private binTape = new BinTape();
    private binEnabled = true;

    public constructor(opts: Options) {
        this.opts = opts;
        this.asm.setOutputHandler({
            setEnable: en => this.binEnabled = en,
            changeField: field => this.binEnabled && this.binTape.writeField(field),
            changeOrigin: org => this.binEnabled && this.binTape.writeOrigin(org),
            writeValue: (_clc, val) => this.binEnabled && this.binTape.writeWord(val, true),
        });
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
