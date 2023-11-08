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

import { performance } from "perf_hooks";
import { command, number, option, positional, run } from "cmd-ts";
import { readFileSync } from "fs";
import peggy from "peggy";
import { Parser } from "../src/parser/Parser.js";

const cmd = command({
    name: "benchmark",
    description: "Yamas Performance Benchmark",
    args: {
        spinTime: option({
            long: "spin-time",
            short: "s",
            description: "Spin-up time in seconds",
            type: number,
            defaultValue: () => 1,
        }),
        measureTime: option({
            long: "measure-time",
            short: "t",
            description: "Spin-up time in seconds",
            type: number,
            defaultValue: () => 5,
        }),
        file: positional({
            description: "Input file to benchmark",
            displayName: "file",
        }),
    },
    handler: (args) => {
        console.log("Preparing...");
        const src = readFileSync(args.file, "utf-8");
        const numLines = src.split("\n").length;
        const peggyParser = peggy.generate(readFileSync("docs/grammar.peggy", "utf-8"), { output: "parser" });

        const runPeggy = () => void peggyParser.parse(src);
        const runYamas = () => {
            const yamasParser = new Parser({}, args.file, src);
            yamasParser.parseProgram();
        };

        measure("Yamas", runYamas, numLines, args.spinTime, args.measureTime);
        measure("Peggy", runPeggy, numLines, args.spinTime, args.measureTime);
    }
});

function measure(name: string, f: () => void, numLines: number, spinTime: number, measureTime: number) {
    console.log(`${name}: Spinning for ${spinTime} s`);
    spin(f, spinTime);

    console.log(`${name}: Measuring for ${measureTime} s`);
    const { iterations, duration } = spin(f, measureTime);
    console.log(`${numLines} lines * ${iterations} iterations in ${duration.toFixed(2)}`);
    console.log(`=> ${(numLines * iterations / duration).toFixed(0)} lines / s`);
}

function spin(f: () => void, seconds: number) {
    const start = performance.now();
    let duration = 0;
    let n = 0;
    while (duration < seconds) {
        f();
        n++;
        duration = (performance.now() - start) / 1000.0;
    }
    return { iterations: n, duration: duration };
}

void run(cmd, process.argv.slice(2));
