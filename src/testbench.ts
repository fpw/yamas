import { existsSync, readFileSync, readdirSync } from "fs";
import path, { basename } from "path";
import { parse } from "ts-command-line-args";
import { Yamas, YamasOptions } from "./Yamas";
import { BinTapeReader } from "./tapeformats/BinTapeReader";
import { MemSize } from "./utils/PDP8";
import { numToOctal } from "./utils/Strings";

interface CliArgs {
    help?: boolean;
    dir: string;
}

function main() {
    const args = parse<CliArgs>({
        help: { type: Boolean, optional: true, description: "Show usage help" },
        dir: { type: String, defaultOption: true, description: "Input directory" },
    },
    {
        helpArg: "help",
    });

    for (const fileName of readdirSync(args.dir)) {
        if (!fileName.match(/\.(pa|pal)$/)) {
            continue;
        }
        const filePath = args.dir + "/" + fileName;
        const bnPath = path.format({ ...path.parse(filePath), base: "", ext: ".bn" });
        if (!existsSync(bnPath)) {
            continue;
        }

        const optsPath = path.format({ ...path.parse(filePath), base: "", ext: ".options.json" });
        let rawOpts: object | undefined;
        if (existsSync(optsPath)) {
            rawOpts = JSON.parse(readFileSync(optsPath, "utf-8")) as object;
        }
        const opts = createOptions(rawOpts);
        const res = testOne(opts, filePath, bnPath);
        console.log(`Checked ${basename(filePath)}: ${res ? "good" : "bad"}`);
    }
}

function createOptions(json?: object): YamasOptions {
    const opts: YamasOptions = {
        loadPrelude: true,
    };

    if (!json) {
        return opts;
    }

    if ("disabledPseudos" in json) {
        opts.disablePseudos = json.disabledPseudos as string[];
    }

    return opts;
}

function testOne(opts: YamasOptions, srcPath: string, bnPath: string): boolean {
    const shouldBin = readFileSync(bnPath);
    const src = readFileSync(srcPath, "ascii");

    try {
        const yamas = new Yamas(opts);
        yamas.addInput(`${basename(srcPath)}`, src);
        const output = yamas.run();
        if (output.errors.length > 0) {
            output.errors.forEach(e => console.error(e));
            return false;
        }
        return compareBin(`${basename(bnPath)}`, output.binary, shouldBin);
    } catch (e) {
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
