import { existsSync, readFileSync, readdirSync } from "fs";
import path, { basename } from "path";
import { parse } from "ts-command-line-args";
import { Options, Yamas } from "./Yamas";
import { BinTapeReader } from "./tapeformats/BinTapeReader";
import { CodeError } from "./utils/CodeError";
import { MemSize } from "./utils/PDP8";
import { numToOctal } from "./utils/Strings";

interface CliArgs {
    help?: boolean;
    dir: string;
}

function main() {
    const args = parse<CliArgs>({
        help: {type: Boolean, optional: true, description: "Show usage help"},
        dir: {type: String, defaultOption: true, description: "Input directory"},
    },
    {
        helpArg: "help",
    });

    for (const fileName of readdirSync(args.dir)) {
        if (!fileName.match(/\.(pa|pal|ma)$/)) {
            continue;
        }
        const filePath = args.dir + "/" + fileName;
        const bnPath = path.format({...path.parse(filePath), base: "", ext: ".bn"})
        if (!existsSync(bnPath)) {
            continue;
        }

        const res = testOne(filePath, bnPath);
        console.log(`Checked ${basename(filePath)}: ${res ? "good" : "bad"}`);
    }
}

function testOne(srcPath: string, bnPath: string): boolean {
    const opts: Options = {
        loadPrelude: true
    };
    const shouldBin = readFileSync(bnPath);
    const src = readFileSync(srcPath, "ascii");

    try {
        const yamas = new Yamas(opts);
        yamas.addInput(`${basename(srcPath)}`, src);
        const isBin = yamas.run();
        return compareBin(`${basename(bnPath)}`, isBin, shouldBin);
    } catch (e) {
        if (e instanceof CodeError) {
            console.error(`${e.inputName}:${e.line}:${e.col}: ${e.message}`);
        }
        console.error(e);
        return false;
    }
}

function compareBin(name: string, ours: Uint8Array, other: Uint8Array): boolean {
    const ourState = new BinTapeReader(ours).read();
    const otherState = new BinTapeReader(other).read();
    let good = true;

    for (let i = 0; i < MemSize; i++) {
        if (ourState[i] !== otherState[i]) {
            good = false;
            const addrStr = numToOctal(i, 5);
            const ourStr = ourState[i] !== undefined ? numToOctal(ourState[i]!, 4) : "null";
            const otherStr = otherState[i] !== undefined ? numToOctal(otherState[i]!, 4) : "null";
            console.log(`${name}: ${addrStr}: our ${ourStr} != other ${otherStr}`);
        }
    }

    return good;
}

main();
