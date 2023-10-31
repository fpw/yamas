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

import { Assembler, AssemblerOptions } from "./assembler/Assembler";
import { Program } from "./parser/Node";
import { PreludeFamily8 } from "./prelude/Family8";
import { PreludeIO } from "./prelude/IO";
import { Prelude8E } from "./prelude/PDP8E";
import { BinTapeWriter } from "./tapeformats/BinTapeWriter";
import { CodeError } from "./utils/CodeError";

export interface YamasOptions {
    loadPrelude?: boolean;

    // to disable given pseudos, e.g. to assemble code that uses DEFINE as symbol
    disablePseudos?: string[];

    // Ideas:

    // implementation idea: keep an array of LinKTables in Assembler
    keepLinksInFieldSwitch?: boolean; // to not delete link table when switching fields
};

export interface YamasOutput {
    binary: Uint8Array;
    errors: CodeError[];
}

export class Yamas {
    private asm: Assembler;
    private opts: YamasOptions;
    private binTape = new BinTapeWriter();

    public constructor(opts: YamasOptions) {
        this.opts = opts;
        this.asm = new Assembler(this.convertOpts(opts));

        this.asm.setOutputHandler({
            changeField: field => this.binTape.writeField(field),
            changeOrigin: org => this.binTape.writeOrigin(org),
            writeValue: (_clc, val) => this.binTape.writeDataWord(val, true),
        });

        if (this.opts.loadPrelude) {
            this.asm.parseInput("prelude/family8.pa", PreludeFamily8);
            this.asm.parseInput("prelude/iot.pa", PreludeIO);
            this.asm.parseInput("prelude/pdp8e.pa", Prelude8E);
        }
    }

    private convertOpts(opts: YamasOptions): AssemblerOptions {
        return {
            disabledPseudos: opts.disablePseudos,
        };
    }

    public addInput(name: string, content: string): Program {
        return this.asm.parseInput(name, content);
    }

    public run(): YamasOutput {
        const errors = this.asm.assembleAll();
        const binary = this.binTape.finish();
        return { binary, errors };
    }
}
