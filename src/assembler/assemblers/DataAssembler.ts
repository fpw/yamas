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
        const output: number[] = [];

        if (!ctx.generateCode) {
            // in pass 1, we can live without the value
            output.push(val ?? 0);
        } else {
            // but in pass 2, we really need to access the value
            if (val === null) {
                throw new AssemblerError("Undefined expression", stmt);
            }
            output.push(val);
        }
        return { output };
    }

    private handleRadix(ctx: Context, stmt: Nodes.RadixStatement): StatementEffect {
        return { setRadix: stmt.radix };
    }

    private handleZBlock(ctx: Context, stmt: Nodes.ZBlockStatement): StatementEffect {
        const amount = this.evaluator.safeEval(ctx, stmt.expr);
        const output: number[] = new Array<number>(amount).fill(0);
        return { output };
    }

    private handleText(ctx: Context, stmt: Nodes.TextStatement): StatementEffect {
        const output = CharSets.asciiStringToDec(stmt.text, !this.opts.noNullTermination);
        return { output };
    }

    private handleFileName(ctx: Context, stmt: Nodes.FilenameStatement): StatementEffect {
        const output = CharSets.asciiStringToOS8Name(stmt.name);
        return { output };
    }

    private handleDevice(ctx: Context, name: Nodes.DevNameStatement): StatementEffect {
        const dev = name.name.padEnd(4, "@");
        const output = CharSets.asciiStringToDec(dev, false);
        return { output };
    }

    private handleDubl(ctx: Context, stmt: Nodes.DoubleIntList): StatementEffect {
        if (stmt.list.length == 0) {
            return {};
        }

        const output: number[] = [];
        for (const dubl of stmt.list) {
            if (dubl.type != NodeType.DoubleInt) {
                continue;
            }
            let num = parseIntSafe(dubl.value, 10);
            if (dubl.unaryOp?.operator === "-") {
                num = -num;
            }
            output.push((num >> 12) & 0o7777);
            output.push(num & 0o7777);
        }
        return { output };
    }

    private handleFltg(ctx: Context, stmt: Nodes.FloatList): StatementEffect {
        if (stmt.list.length == 0) {
            return {};
        }

        const output: number[] = [];
        for (const fltg of stmt.list) {
            if (fltg.type != NodeType.Float) {
                continue;
            }

            let numStr = fltg.value;
            if (fltg.unaryOp?.operator == "-") {
                numStr = `-${numStr}`;
            }

            const [e, mHi, mLo] = encodeDECFloat(numStr);
            output.push(e);
            output.push(mHi);
            output.push(mLo);
        }
        return { output };
    }

    private handlePunchControl(ctx: Context, stmt: Nodes.PunchCtrlStatement): StatementEffect {
        return { setPunchEnable: stmt.enable };
    }
}
