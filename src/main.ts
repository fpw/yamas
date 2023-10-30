/*
 *   Yamas - Yet Another Macro Assembler (for the PDP-8)
 *   Copyright (C) 2023 Folke Will <folko@solhost.org>
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Affero General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU Affero General Public License for more details.
 *
 *   You should have received a copy of the GNU Affero General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { closeSync, openSync, readFileSync, writeFileSync, writeSync } from "fs";
import { basename } from "path";
import { parse } from "ts-command-line-args";
import { YamasOptions, Yamas } from "./Yamas";
import { formatCodeError } from "./utils/CodeError";

interface CliArgs {
    help?: boolean;
    files: string[];
    noPrelude?: boolean;
    compare?: string;
    outputAst?: boolean;
}

function main() {
    const args = parse<CliArgs>({
        help: { type: Boolean, optional: true, description: "Show usage help" },
        noPrelude: { type: Boolean, optional: true, defaultValue: false, description: "Do not define common symbols" },
        files: { type: String, multiple: true, defaultOption: true, description: "Input files" },
        compare: { type: String, optional: true, alias: "c", description: "Compare output with a given bin file" },
        outputAst: { type: Boolean, optional: true, alias: "a", description: "Write abstract syntrax tree" },
    }, {
        helpArg: "help",
    });

    const opts: YamasOptions = {};
    opts.loadPrelude = args.noPrelude ? false : true;

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

    const output = yamas.run();
    output.errors.forEach(e => console.error(formatCodeError(e)));
    if (output.errors.length == 0) {
        writeFileSync("out.bin", output.binary);
    }

    astFiles.forEach(fd => closeSync(fd));
}

main();
