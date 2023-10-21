import { parse } from "ts-command-line-args";
import { Assembler } from "./Assembler";
import { readFileSync } from "fs";

interface Options {
    help?: boolean;
    files: string[];
}

function main() {
    const args = parse<Options>({
        help: {type: Boolean, optional: true, description: "Show usage help"},
        files: {type: String, multiple: true, defaultOption: true},
    },
    {
        helpArg: "help",
    });

    const asm = new Assembler();
    for (const file of args.files) {
        const src = readFileSync(file, "ascii");
        asm.addFile(file, src);
    }
    asm.run();
}

main();
