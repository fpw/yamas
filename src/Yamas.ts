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

import { Assembler, AssemblerOptions } from "./assembler/Assembler.js";
import { SymbolData } from "./assembler/SymbolData.js";
import { Program } from "./parser/nodes/Node.js";
import { PreludeFamily8 } from "./prelude/Family8.js";
import { PreludeIO } from "./prelude/IO.js";
import { Prelude8E } from "./prelude/PDP8E.js";
import { BinTapeWriter } from "./tapeformats/BinTapeWriter.js";
import { CodeError } from "./utils/CodeError.js";

export interface YamasOptions extends AssemblerOptions {
    loadPrelude?: boolean;
};

export interface YamasOutput {
    binary: Uint8Array;
    errors: ReadonlyArray<CodeError>;
    symbols: ReadonlyMap<string, SymbolData>;
}

export class Yamas {
    private asm: Assembler;
    private opts: YamasOptions;
    private binTape = new BinTapeWriter();

    public constructor(opts: YamasOptions) {
        this.opts = opts;
        this.asm = new Assembler(opts);

        this.asm.setOutputHandler({
            changeField: field => this.binTape.writeField(field),
            changeOrigin: org => this.binTape.writeOrigin(org),
            writeValue: (_clc, val) => this.binTape.writeDataWord(val),
        });

        if (this.opts.loadPrelude) {
            this.asm.parseInput("prelude/family8.pa", PreludeFamily8);
            this.asm.parseInput("prelude/iot.pa", PreludeIO);
            this.asm.parseInput("prelude/pdp8e.pa", Prelude8E);
        }
    }

    public addInput(name: string, content: string): Program {
        return this.asm.parseInput(name, content);
    }

    public run(): YamasOutput {
        const errors = this.asm.assembleAll();
        const symbols = this.asm.getSymbols();
        const binary = this.binTape.finish();

        return { binary, symbols, errors };
    }
}
