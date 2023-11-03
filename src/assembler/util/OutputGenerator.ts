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

import * as Nodes from "../../parser/Node.js";
import { NodeType } from "../../parser/Node.js";
import * as CharSets from "../../utils/CharSets.js";
import { toDECFloat } from "../../utils/Floats.js";
import { parseIntSafe } from "../../utils/Strings.js";
import { AssemblerOptions, OutputHandler } from "../Assembler.js";
import { Context } from "../Context.js";

export class OutputGenerator {
    private outputHandler?: OutputHandler;

    public constructor(private options: AssemblerOptions) {
    }

    public setOutputHandler(out: OutputHandler) {
        this.outputHandler = out;
    }

    public outputZBlock(ctx: Context, num: number): boolean {
        let loc = ctx.getClc(false);
        for (let i = 0; i < num; i++) {
            this.punchData(ctx, loc, 0);
            loc++;
        }
        return true;
    }

    public outputText(ctx: Context, text: string): boolean {
        const outStr = CharSets.asciiStringToDec(text, !this.options.noNullTermination);
        const addr = ctx.getClc(false);
        outStr.forEach((w, i) => this.punchData(ctx, addr + i, w));
        return true;
    }

    public outputFileName(ctx: Context, text: string): boolean {
        const outStr = CharSets.asciiStringToOS8Name(text);
        const addr = ctx.getClc(false);
        outStr.forEach((w, i) => this.punchData(ctx, addr + i, w));
        return true;
    }

    public outputDeviceName(ctx: Context, name: string): boolean {
        const dev = name.padEnd(4, "\0");
        const outStr = CharSets.asciiStringToDec(dev, false);
        const addr = ctx.getClc(false);
        outStr.forEach((w, i) => this.punchData(ctx, addr + i, w));
        return true;
    }

    public outputDubl(ctx: Context, stmt: Nodes.DoubleIntList): boolean {
        if (stmt.list.length == 0) {
            return false;
        }

        let loc = ctx.getClc(false);
        for (const dubl of stmt.list) {
            if (dubl.type != NodeType.DoubleInt) {
                continue;
            }
            let num = parseIntSafe(dubl.token.value, 10);
            if (dubl.unaryOp?.operator === "-") {
                num = -num;
            }
            this.punchData(ctx, loc++, (num >> 12) & 0o7777);
            this.punchData(ctx, loc++, num & 0o7777);
        }
        return true;
    }

    public outputFltg(ctx: Context, stmt: Nodes.FloatList): boolean {
        if (stmt.list.length == 0) {
            return false;
        }

        let loc = ctx.getClc(false);
        for (const fltg of stmt.list) {
            if (fltg.type != NodeType.Float) {
                continue;
            }

            const [e, m1, m2] = toDECFloat(fltg.token.float);
            this.punchData(ctx, loc++, e);
            this.punchData(ctx, loc++, m1);
            this.punchData(ctx, loc++, m2);
        }
        return true;
    }

    public punchData(ctx: Context, addr: number, val: number) {
        if (ctx.punchEnabled && this.outputHandler) {
            this.outputHandler.writeValue(addr, val);
        }
    }

    public punchOrigin(ctx: Context, origin?: number) {
        if (ctx.punchEnabled && this.outputHandler) {
            const to = origin ?? ctx.getClc(false);
            this.outputHandler.changeOrigin(to);
        }
    }

    public punchField(ctx: Context, field: number) {
        if (ctx.punchEnabled && this.outputHandler) {
            this.outputHandler.changeField(field);
        }
    }
}
