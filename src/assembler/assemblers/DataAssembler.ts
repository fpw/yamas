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
import { Assembler, AssemblerOptions } from "../Assembler.js";
import { StatementEffect, StatementHandler } from "../util/StatementEffect.js";
import { Context } from "../Context.js";
import { ExprEvaluator } from "../util/ExprEvaluator.js";
import { OutputGenerator } from "../util/OutputGenerator.js";

export class DataAssembler {
    public opts: AssemblerOptions;
    public evaluator: ExprEvaluator;
    public output: OutputGenerator;

    public constructor(opts: AssemblerOptions, output: OutputGenerator, evaluator: ExprEvaluator) {
        this.opts = opts;
        this.evaluator = evaluator;
        this.output = output;
    }

    public get handlers(): [NodeType, StatementHandler][] {
        return [
            [NodeType.Radix, (ctx, stmt) => this.handleRadix(ctx, stmt as Nodes.RadixStatement)],
            [NodeType.ExpressionStmt, (ctx, stmt) => this.handleExprStmt(ctx, stmt as Nodes.ExpressionStatement)],
            [NodeType.PunchControl, (ctx, stmt) => this.handlePunchControl(ctx, stmt as Nodes.PunchCtrlStatement)],
            [NodeType.ZeroBlock, (ctx, stmt) => this.handleZBlock(ctx, stmt as Nodes.ZBlockStatement)],
            [NodeType.Text, (ctx, stmt) => this.handleText(ctx, stmt as Nodes.TextStatement)],
            [NodeType.FileName, (ctx, stmt) => this.handleFileName(ctx, stmt as Nodes.FilenameStatement)],
            [NodeType.DeviceName, (ctx, stmt) => this.handleDevice(ctx, stmt as Nodes.DevNameStatement)],
            [NodeType.DoubleIntList, (ctx, stmt) => this.handleDubl(ctx, stmt as Nodes.DoubleIntList)],
            [NodeType.FloatList, (ctx, stmt) => this.handleFltg(ctx, stmt as Nodes.FloatList)],
        ];
    }

    private handleRadix(ctx: Context, stmt: Nodes.RadixStatement): StatementEffect {
        ctx.radix = stmt.radix;
        return {};
    }

    private handleZBlock(ctx: Context, stmt: Nodes.ZBlockStatement): StatementEffect {
        const amount = this.evaluator.safeEval(ctx, stmt.expr);
        let loc = ctx.getClc(false);
        for (let i = 0; i < amount; i++) {
            this.output.punchData(ctx, loc, 0);
            loc++;
        }
        return { incClc: amount };
    }

    private handleText(ctx: Context, stmt: Nodes.TextStatement): StatementEffect {
        const outStr = CharSets.asciiStringToDec(stmt.str.str, !this.opts.noNullTermination);
        const addr = ctx.getClc(false);
        outStr.forEach((w, i) => this.output.punchData(ctx, addr + i, w));
        return { incClc: outStr.length };
    }

    private handleFileName(ctx: Context, stmt: Nodes.FilenameStatement): StatementEffect {
        const outStr = CharSets.asciiStringToOS8Name(stmt.name.str);
        const addr = ctx.getClc(false);
        outStr.forEach((w, i) => this.output.punchData(ctx, addr + i, w));
        return { incClc: outStr.length };
    }

    private handleDevice(ctx: Context, name: Nodes.DevNameStatement): StatementEffect {
        const dev = name.name.token.symbol.padEnd(4, "\0");
        const outStr = CharSets.asciiStringToDec(dev, false);
        const addr = ctx.getClc(false);
        outStr.forEach((w, i) => this.output.punchData(ctx, addr + i, w));
        return { incClc: outStr.length };
    }

    private handleDubl(ctx: Context, stmt: Nodes.DoubleIntList): StatementEffect {
        if (stmt.list.length == 0) {
            return {};
        }

        const startLoc = ctx.getClc(false);
        let loc = ctx.getClc(false);
        for (const dubl of stmt.list) {
            if (dubl.type != NodeType.DoubleInt) {
                continue;
            }
            let num = parseIntSafe(dubl.token.value, 10);
            if (dubl.unaryOp?.operator === "-") {
                num = -num;
            }
            this.output.punchData(ctx, loc++, (num >> 12) & 0o7777);
            this.output.punchData(ctx, loc++, num & 0o7777);
        }
        return { incClc: loc - startLoc };
    }

    private handleFltg(ctx: Context, stmt: Nodes.FloatList): StatementEffect {
        if (stmt.list.length == 0) {
            return {};
        }

        const startLoc = ctx.getClc(false);
        let loc = ctx.getClc(false);
        for (const fltg of stmt.list) {
            if (fltg.type != NodeType.Float) {
                continue;
            }

            const [e, m1, m2] = toDECFloat(fltg.token.float);
            this.output.punchData(ctx, loc++, e);
            this.output.punchData(ctx, loc++, m1);
            this.output.punchData(ctx, loc++, m2);
        }
        return { incClc: loc - startLoc };
    }

    private handlePunchControl(ctx: Context, stmt: Nodes.PunchCtrlStatement): StatementEffect {
        ctx.punchEnabled = stmt.enable;
        return {};
    }

    private handleExprStmt(ctx: Context, stmt: Nodes.ExpressionStatement): StatementEffect {
        // we need to evaluate in both passes to generate links in MRI statements in correct order
        const val = this.evaluator.tryEval(ctx, stmt.expr);
        if (ctx.generateCode) {
            if (val === null) {
                throw Assembler.mkError("Undefined expression", stmt);
            }
            this.output.punchData(ctx, ctx.getClc(false), val);
        }
        return { incClc: 1 };
    }
}
