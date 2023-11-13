#!/usr/bin/env node
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

import { command, positional, run } from "cmd-ts";
import { existsSync, readFileSync, readdirSync } from "fs";
import path, { basename } from "path";
import peggy from "peggy";
import { YamasOptions } from "../src/Yamas.js";

const cmd = command({
    name: "yamas-tb",
    description: "Yamas grammar doc testbench",
    args: {
        dir: positional({
            description: "Input directory with .pa(l) files",
            displayName: "directory",
        }),
    },
    handler: (args) => {
        console.log("Compiling grammar...");
        const peggyParser = peggy.generate(readFileSync("docs/yamas.peggy", "utf-8"), {
            output: "parser",
        });

        for (const fileName of readdirSync(args.dir)) {
            if (!fileName.match(/\.(pa|pal)$/)) {
                continue;
            }
            const filePath = args.dir + "/" + fileName;
            const optsPath = path.format({ ...path.parse(filePath), base: "", ext: ".options.json" });
            let rawOpts: object | undefined;
            if (existsSync(optsPath)) {
                rawOpts = JSON.parse(readFileSync(optsPath, "utf-8")) as object;
            }
            const opts = createOptions(rawOpts);
            const res = testOne(peggyParser, opts, filePath);
            console.log(`Checked ${basename(filePath)}: ${res ? "good" : "bad"}`);
        }
    }
});

function createOptions(json?: object): YamasOptions {
    const opts: YamasOptions = {
        loadPrelude: true,
    };

    if (!json) {
        return opts;
    }

    if ("disabledPseudos" in json) {
        opts.disabledPseudos = json.disabledPseudos as string[];
    }

    return opts;
}

function testOne(parser: peggy.Parser, opts: YamasOptions, srcPath: string): boolean {
    const src = readFileSync(srcPath, "utf-8");

    try {
        parser.parse(src, opts);
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}

void run(cmd, process.argv.slice(2));
