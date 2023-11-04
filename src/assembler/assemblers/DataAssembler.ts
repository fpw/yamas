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
import { Context } from "../Context.js";
import { ExprEvaluator } from "../util/ExprEvaluator.js";
import { OutputFilter } from "../util/OutputFilter.js";
import { RegisterFunction, StatementEffect } from "../util/StatementEffect.js";

/**
 * Assembler for statements related to data output.
 */
export class DataAssembler {
    public opts: AssemblerOptions;
    public evaluator: ExprEvaluator;
    public output: OutputFilter;

    public constructor(opts: AssemblerOptions, output: OutputFilter, evaluator: ExprEvaluator) {
        this.opts = opts;
        this.evaluator = evaluator;
        this.output = output;
    }

    public registerHandlers(register: RegisterFunction) {
        register(NodeType.ExpressionStmt, this.handleExprStmt.bind(this));
        register(NodeType.Radix, this.handleRadix.bind(this));
        register(NodeType.PunchControl, this.handlePunchControl.bind(this));
        register(NodeType.ZeroBlock, this.handleZBlock.bind(this));
        register(NodeType.Text, this.handleText.bind(this));
        register(NodeType.FileName, this.handleFileName.bind(this));
        register(NodeType.DeviceName, this.handleDevice.bind(this));
        register(NodeType.DoubleIntList, this.handleDubl.bind(this));
        register(NodeType.FloatList, this.handleFltg.bind(this));
    }

    private handleExprStmt(ctx: Context, stmt: Nodes.ExpressionStatement): StatementEffect {
        // we need to evaluate in both passes to generate links in MRI statements in correct order
        const val = this.evaluator.tryEval(ctx, stmt.expr);

        // but in pass 2, we really need to access the value
        if (ctx.generateCode) {
            if (val === null) {
                throw Nodes.mkNodeError("Undefined expression", stmt);
            }
            this.output.punchData(ctx, ctx.getClc(false), val);
        }
        return { incClc: 1 };
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
        const outStr = CharSets.asciiStringToDec(stmt.text, !this.opts.noNullTermination);
        const addr = ctx.getClc(false);
        outStr.forEach((w, i) => this.output.punchData(ctx, addr + i, w));
        return { incClc: outStr.length };
    }

    private handleFileName(ctx: Context, stmt: Nodes.FilenameStatement): StatementEffect {
        const outStr = CharSets.asciiStringToOS8Name(stmt.name);
        const addr = ctx.getClc(false);
        outStr.forEach((w, i) => this.output.punchData(ctx, addr + i, w));
        return { incClc: outStr.length };
    }

    private handleDevice(ctx: Context, name: Nodes.DevNameStatement): StatementEffect {
        const dev = name.name.padEnd(4, "\0");
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
            let num = parseIntSafe(dubl.value, 10);
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

            let num = Number.parseFloat(fltg.value);
            if (fltg.unaryOp?.operator == "-") {
                num *= -1;
            }

            const [e, m1, m2] = toDECFloat(num);
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
}
