import { appendFileSync, readFileSync, unlinkSync } from "fs";
import { parse } from "ts-command-line-args";
import { Options, Yamas } from "./Yamas";

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
    if (args.outputAst) {
        opts.outputAst = (file, line) => appendFileSync(file + ".ast.txt", line + "\n");
    }

    const yamas = new Yamas(opts);
    for (const file of args.files) {
        const src = readFileSync(file, "ascii");
        yamas.addInput(file, src);
    }
    yamas.run();
}

main();
