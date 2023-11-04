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

import { AssemblerOptions, OutputHandler } from "../Assembler.js";
import { Context } from "../Context.js";

export class OutputGenerator {
    private outputHandler?: OutputHandler;

    public constructor(private options: AssemblerOptions) {
    }

    public setOutputHandler(out: OutputHandler) {
        this.outputHandler = out;
    }

    public punchData(ctx: Context, addr: number, val: number) {
        if (ctx.doOutput && this.outputHandler) {
            this.outputHandler.writeValue(addr, val);
        }
    }

    public punchOrigin(ctx: Context, origin?: number) {
        if (ctx.doOutput && this.outputHandler) {
            const to = origin ?? ctx.getClc(false);
            this.outputHandler.changeOrigin(to);
        }
    }

    public punchField(ctx: Context, field: number) {
        if (ctx.doOutput && this.outputHandler) {
            this.outputHandler.changeField(field);
        }
    }
}
