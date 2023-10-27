import { Assembler } from "./assembler/Assembler";
import { dumpNode } from "./parser/Node";
import { PreludeEAE } from "./prelude/EAE";
import { PreludeFamily8 } from "./prelude/Family8";
import { PreludeIO } from "./prelude/IO";
import { BinTapeReader } from "./tapeformats/BinTapeReader";
import { BinTapeWriter } from "./tapeformats/BinTapeWriter";
import * as Strings from "./utils/Strings";

export interface Options {
    loadPrelude?: boolean;
    outputAst?: (inputName: string, line: string) => void;
    outputBin?: (byte: number) => void;
    outputSyms?: (line: string) => void;
    compareBin?: Uint8Array;
};

export class Yamas {
    private asm = new Assembler();
    private opts: Options;
    private binTape = new BinTapeWriter();
    private binEnabled = true;

    public constructor(opts: Options) {
        this.opts = opts;
        this.asm.setOutputHandler({
            setEnable: en => this.binEnabled = en,
            changeField: field => this.binEnabled && this.binTape.writeField(field),
            changeOrigin: org => this.binEnabled && this.binTape.writeOrigin(org),
            writeValue: (_clc, val) => this.binEnabled && this.binTape.writeDataWord(val, true),
        });

        if (opts.loadPrelude) {
            this.asm.parseInput("prelude/family8.pa", PreludeFamily8);
            this.asm.parseInput("prelude/iot.pa", PreludeIO);
            this.asm.parseInput("prelude/eae.pa", PreludeEAE);
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
        if (this.opts.compareBin) {
            this.compare(bin, this.opts.compareBin);
        }
        return bin;
    }

    private compare(ours: Uint8Array, other: Uint8Array) {
        const ourState = new BinTapeReader(ours).read();
        const otherState = new BinTapeReader(other).read();

        for (let i = 0; i < 8 * 4096; i++) {
            if (ourState[i] !== otherState[i]) {
                const addrStr = Strings.numToOctal(i, 5);
                const ourStr = ourState[i] !== undefined ? Strings.numToOctal(ourState[i]!, 4) : "null";
                const otherStr = otherState[i] !== undefined ? Strings.numToOctal(otherState[i]!, 4) : "null";
                console.log(`${addrStr}: ${ourStr} != ${otherStr}`);
            }
        }
    }
}
