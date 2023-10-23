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
        this.asm.setOutputHandler({
            setEnable: () => undefined,
            changeField: field => console.log(`FIELD = ${field}`),
            changeOrigin: org => console.log(`ORG = ${org.toString(8).padStart(4, "0")}`),
            writeValue: (clc, val) => console.log(` ${clc.toString(8).padStart(5, "0")} = ${val.toString(8).padStart(4, "0")}`),
        });
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
