import { closeSync, openSync, readFileSync, writeFileSync, writeSync } from "fs";
import { parse } from "ts-command-line-args";
import { Options, Yamas } from "./Yamas";
import { basename } from "path";

interface CliArgs {
    help?: boolean;
    files: string[];
    compare?: string;
    outputAst?: boolean;
}

function main() {
    const args = parse<CliArgs>({
        help: {type: Boolean, optional: true, description: "Show usage help"},
        files: {type: String, multiple: true, defaultOption: true, description: "Input files"},
        compare: {type: String, optional: true, alias: "c", description: "Compare output with a given bin file"},
        outputAst: {type: Boolean, optional: true, alias: "a", description: "Write abstract syntrax tree"},
    },
    {
        helpArg: "help",
    });

    const opts: Options = {};
    const astFiles = new Map<string, number>();
    if (args.outputAst) {
        args.files.forEach(f => astFiles.set(f, openSync(basename(f) + ".ast.txt", "w")));
        opts.outputAst = (file, line) => writeSync(astFiles.get(file)!, line + "\n");
    }

    if (args.compare) {
        opts.compareBin = readFileSync(args.compare);
    }

    const yamas = new Yamas(opts);
    for (const file of args.files) {
        const src = readFileSync(file, "ascii");
        yamas.addInput(file, src);
    }
    const bin = yamas.run();
    writeFileSync("out.bin", bin);

    astFiles.forEach(fd => closeSync(fd));
}

main();
