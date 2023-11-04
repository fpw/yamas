#!/usr/bin/env node
/* eslint-disable max-lines-per-function */
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

import { array, command, flag, option, optional, positional, run, string } from "cmd-ts";
import { closeSync, openSync, readFileSync, writeFileSync } from "fs";
import { basename } from "path";
import { Yamas, YamasOptions } from "../src/Yamas.js";
import { dumpNode } from "../src/parser/Node.js";
import { formatCodeError } from "../src/utils/CodeError.js";
import { compareBin } from "../src/tapeformats/compareBin.js";

// eslint-disable-next-line max-lines-per-function
const cmd = command({
    name: "yamas",
    description: "Yet Another Macro Assembler (for PDP-8)",
    args: {
        version: flag({
            long: "version",
            short: "v",
            description: "Show version",
        }),
        noPrelude: flag({
            long: "no-prelude",
            description: "Do not set default symbols",
        }),
        orShifts: flag({
            long: "or-shifts",
            short: "b",
            description: "OR operator performs left shift first, like /B in PAL8",
        }),
        noNullTermination: flag({
            long: "no-text-termination",
            short: "f",
            description: "do not add null termination to TEXT strings, like /F in PAL8",
        }),
        outputAst: flag({
            long: "write-ast",
            short: "a",
            description: "Write abstract syntax tree",
        }),
        forgetLiterals: flag({
            long: "forget-literals",
            short: "w",
            description: "Forget literals on page change, like /W in PAL8",
        }),
        compareWith: option({
            long: "compare",
            short: "c",
            description: "Compare output with given bin file",
            type: optional(string),
        }),
        disabledPseudos: option({
            long: "disable-pseudos",
            short: "d",
            description: "Disable pseudo symbols",
            type: optional(string),
        }),
        filesStr: positional({
            description: "Input source files",
            displayName: "sources",
            type: optional(string),
        }),
    },

    handler: (args) => {
        if (args.version) {
            console.log(`Yamas ${process.env.npm_package_version}`);
            process.exit(0);
        }

        if (!args.filesStr) {
            console.error("No sources given");
            process.exit(-1);
        }

        const opts: YamasOptions = {};
        opts.loadPrelude = !args.noPrelude;
        opts.orDoesShift = args.orShifts;
        opts.noNullTermination = args.noNullTermination;
        opts.disabledPseudos = args.disabledPseudos?.split(",");
        opts.forgetLiterals = args.forgetLiterals;

        const files = args.filesStr.split(" ");

        const yamas = new Yamas(opts);
        for (const file of files) {
            const src = readFileSync(file, "ascii");
            const ast = yamas.addInput(file, src);
            if (args.outputAst) {
                const astFile = openSync(basename(file) + ".ast.txt", "w");
                dumpNode(ast, line => writeFileSync(astFile, line + "\n"));
                closeSync(astFile);
            }
        }

        const output = yamas.run();
        if (output.errors.length > 0) {
            output.errors.forEach(e => console.error(formatCodeError(e)));
            process.exit(-1);
        }

        if (output.errors.length == 0) {
            const lastName = files[files.length - 1];
            writeFileSync(basename(lastName) + ".bin", output.binary);
            console.log(`Wrote ${output.binary.length} bytes`);
        }

        if (args.compareWith) {
            const otherBin = readFileSync(args.compareWith);
            const name = basename(args.compareWith);
            if (compareBin(name, output.binary, otherBin)) {
                console.log("No differences");
                process.exit(0);
            } else {
                process.exit(-1);
            }
        }

        process.exit(output.errors.length == 0 ? 0 : -1);
    }
});

void run(cmd, process.argv.slice(2));
