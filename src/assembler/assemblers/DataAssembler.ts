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

import * as Nodes from "../../parser/nodes/Node.js";
import { NodeType } from "../../parser/nodes/Node.js";
import * as CharSets from "../../utils/CharSets.js";
import { encodeDECFloat } from "../../utils/float/DECFloat.js";
import { parseIntSafe } from "../../utils/Strings.js";
import { AssemblerOptions, SubComponents } from "../Assembler.js";
import { AssemblerError } from "../AssemblerError.js";
import { Context } from "../Context.js";
import { ExprEvaluator } from "../util/ExprEvaluator.js";
import { RegisterFunction, StatementEffect } from "../util/StatementEffect.js";

/**
 * Assembler for statements related to data output.
 */
export class DataAssembler {
    private opts: AssemblerOptions;
    private evaluator: ExprEvaluator;

    public constructor(components: SubComponents) {
        this.opts = components.options;
        this.evaluator = components.evaluator;
    }

    public registerStatements(register: RegisterFunction) {
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
        const output: [number, number][] = [];

        // but in pass 2, we really need to access the value
        if (ctx.generateCode) {
            if (val === null) {
                throw new AssemblerError("Undefined expression", stmt);
            }
            output.push([ctx.getClc(false), val]);
        }
        return { output, incClc: 1 };
    }

    private handleRadix(ctx: Context, stmt: Nodes.RadixStatement): StatementEffect {
        ctx.radix = stmt.radix;
        return {};
    }

    private handleZBlock(ctx: Context, stmt: Nodes.ZBlockStatement): StatementEffect {
        const amount = this.evaluator.safeEval(ctx, stmt.expr);
        const output: [number, number][] = [];
        const loc = ctx.getClc(false);
        for (let i = 0; i < amount; i++) {
            output.push([loc + i, 0]);
        }
        return { output, incClc: amount };
    }

    private handleText(ctx: Context, stmt: Nodes.TextStatement): StatementEffect {
        const outStr = CharSets.asciiStringToDec(stmt.text, !this.opts.noNullTermination);
        const addr = ctx.getClc(false);
        const output: [number, number][] = [];
        outStr.forEach((w, i) => output.push([addr + i, w]));
        return { output, incClc: outStr.length };
    }

    private handleFileName(ctx: Context, stmt: Nodes.FilenameStatement): StatementEffect {
        const outStr = CharSets.asciiStringToOS8Name(stmt.name);
        const addr = ctx.getClc(false);
        const output: [number, number][] = [];
        outStr.forEach((w, i) => output.push([addr + i, w]));
        return { output, incClc: outStr.length };
    }

    private handleDevice(ctx: Context, name: Nodes.DevNameStatement): StatementEffect {
        const dev = name.name.padEnd(4, "@");
        const outStr = CharSets.asciiStringToDec(dev, false);
        const addr = ctx.getClc(false);
        const output: [number, number][] = [];
        outStr.forEach((w, i) => output.push([addr + i, w]));
        return { output, incClc: outStr.length };
    }

    private handleDubl(ctx: Context, stmt: Nodes.DoubleIntList): StatementEffect {
        if (stmt.list.length == 0) {
            return {};
        }

        const output: [number, number][] = [];
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
            output.push([loc++, (num >> 12) & 0o7777]);
            output.push([loc++, num & 0o7777]);
        }
        return { output, incClc: loc - startLoc };
    }

    private handleFltg(ctx: Context, stmt: Nodes.FloatList): StatementEffect {
        if (stmt.list.length == 0) {
            return {};
        }

        const output: [number, number][] = [];
        const startLoc = ctx.getClc(false);
        let loc = ctx.getClc(false);
        for (const fltg of stmt.list) {
            if (fltg.type != NodeType.Float) {
                continue;
            }

            let numStr = fltg.value;
            if (fltg.unaryOp?.operator == "-") {
                numStr = `-${numStr}`;
            }

            const [e, mHi, mLo] = encodeDECFloat(numStr);
            output.push([loc++, e]);
            output.push([loc++, mHi]);
            output.push([loc++, mLo]);
        }
        return { output, incClc: loc - startLoc };
    }

    private handlePunchControl(ctx: Context, stmt: Nodes.PunchCtrlStatement): StatementEffect {
        ctx.punchEnabled = stmt.enable;
        return {};
    }
}
