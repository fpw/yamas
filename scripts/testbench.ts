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
import { Yamas, YamasOptions } from "../src/Yamas.js";
import { compareBin } from "../src/tapeformats/compareBin.js";

const cmd = command({
    name: "yamas-tb",
    description: "Yamas Testbench",
    args: {
        dir: positional({
            description: "Input directory with .pa(l) and .bn files",
            displayName: "directory",
        }),
    },
    handler: (args) => {
        let allGood = true;
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
            if (!res) {
                allGood = false;
            }
            console.log(`Checked ${basename(filePath)}: ${res ? "good" : "bad"}`);
        }
        console.log(`All good: ${allGood}`);
        process.exit(allGood ? 0 : 1);
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

    if ("forgetLiterals" in json) {
        opts.forgetLiterals = json.forgetLiterals as boolean;
    }

    return opts;
}

function testOne(opts: YamasOptions, srcPath: string, bnPath: string): boolean {
    const shouldBin = readFileSync(bnPath);
    const src = readFileSync(srcPath, "utf-8");

    try {
        const yamas = new Yamas(opts);
        yamas.addInput(`${basename(srcPath)}`, src);
        const output = yamas.run();
        if (output.errors.length > 0) {
            console.error(output.errors[0]);
            return false;
        }
        return compareBin(`${basename(bnPath)}`, output.binary, shouldBin);
    } catch (e) {
        console.error(e);
        return false;
    }
}

void run(cmd, process.argv.slice(2));
