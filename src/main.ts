import { closeSync, openSync, readFileSync, writeSync } from "fs";
import { parse } from "ts-command-line-args";
import { Options, Yamas } from "./Yamas";
import { basename } from "path";

interface CliArgs {
    help?: boolean;
    outputAst?: boolean;
    files: string[];
}

function main() {
    const args = parse<CliArgs>({
        help: {type: Boolean, optional: true, description: "Show usage help"},
        outputAst: {type: Boolean, optional: true, alias: "a", description: "Write abstract syntrax tree"},
        files: {type: String, multiple: true, defaultOption: true},
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

    const yamas = new Yamas(opts);
    for (const file of args.files) {
        const src = readFileSync(file, "ascii");
        yamas.addInput(file, src);
    }
    yamas.run();

    astFiles.forEach(fd => closeSync(fd));
}

main();
