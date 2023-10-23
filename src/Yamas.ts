import { Assembler } from "./assembler/Assembler";
import { dumpNode } from "./parser/Node";

export interface Options {
    outputAst?: (inputName: string, line: string) => void;
    outputBin?: (byte: number) => void;
    outputSyms?: (line: string) => void;
};

export class Yamas {
    private asm = new Assembler();
    private opts: Options;

    public constructor(opts: Options) {
        this.opts = opts;
    }

    public addInput(name: string, content: string) {
        const ast = this.asm.addAndParseInput(name, content);
        if (this.opts.outputAst) {
            dumpNode(ast, line => this.opts.outputAst!(name, line));
        }
    }

    public run() {
        this.asm.assembleAll();
    }
}
