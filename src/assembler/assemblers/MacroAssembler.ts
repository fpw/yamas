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

import { Parser } from "../../index.js";
import * as Nodes from "../../parser/Node.js";
import { NodeType } from "../../parser/Node.js";
import { Assembler, AssemblerOptions } from "../Assembler.js";
import { StatementEffect, StatementHandler } from "../util/StatementEffect.js";
import { Context } from "../Context.js";
import { SymbolTable } from "../SymbolTable.js";
import { ExprEvaluator } from "../util/ExprEvaluator.js";
import { OutputGenerator } from "../util/OutputGenerator.js";

export class MacroAssembler {
    public opts: AssemblerOptions;
    private syms: SymbolTable;
    public output: OutputGenerator;
    public evaluator: ExprEvaluator;

    public constructor(opts: AssemblerOptions, syms: SymbolTable, output: OutputGenerator, evaluator: ExprEvaluator) {
        this.opts = opts;
        this.syms = syms;
        this.evaluator = evaluator;
        this.output = output;
    }

    public get handlers(): [NodeType, StatementHandler][] {
        return [
            [NodeType.Define, (ctx, stmt) => this.handleDefine(ctx, stmt as Nodes.DefineStatement)],
            [NodeType.Invocation, (ctx, stmt) => this.handleInvocation(ctx, stmt as Nodes.Invocation)],
            [NodeType.IfDef, (ctx, stmt) => this.handleIfDef(ctx, stmt as Nodes.IfDefStatement)],
            [NodeType.IfNotDef, (ctx, stmt) => this.handleIfDef(ctx, stmt as Nodes.IfNotDefStatement)],
            [NodeType.IfZero, (ctx, stmt) => this.handleIfZero(ctx, stmt as Nodes.IfZeroStatement)],
            [NodeType.IfNotZero, (ctx, stmt) => this.handleIfZero(ctx, stmt as Nodes.IfNotZeroStatement)],
        ];
    }

    private handleDefine(ctx: Context, stmt: Nodes.DefineStatement): StatementEffect {
        if (!ctx.generateCode) {
            // define macros only once so we don't get duplicates in next pass
            this.syms.defineMacro(stmt.name.token.symbol);
        }
        return {};
    }

    private handleIfDef(ctx: Context, stmt: Nodes.IfDefStatement | Nodes.IfNotDefStatement): StatementEffect {
        const sym = this.syms.tryLookup(stmt.symbol.token.symbol);
        if ((sym && stmt.type == NodeType.IfDef) || (!sym && stmt.type == NodeType.IfNotDef)) {
            return this.handleConditionBody(ctx, stmt.body);
        }
        return {};
    }

    private handleIfZero(ctx: Context, stmt: Nodes.IfZeroStatement | Nodes.IfNotZeroStatement): StatementEffect {
        // It's allowed to use IFZERO with undefined expressions if they are later defined
        // However, that only makes sense if the bodies don't generate code.
        // Otherwise, we would get different CLCs after the body in pass 1 vs 2.
        // We will notice that later because parsing happens in pass 1 and execution in pass 2 where the body
        // will be unparsed if this happens.
        const exVal = this.evaluator.tryEval(ctx, stmt.expr);
        const val = (exVal === null ? 0 : exVal);

        if ((val == 0 && stmt.type == NodeType.IfZero) || (val != 0 && stmt.type == NodeType.IfNotZero)) {
            return this.handleConditionBody(ctx, stmt.body);
        } else {
            if (stmt.body.parsed) {
                throw Assembler.mkError("Condition was true in pass 1, now false -> Illegal", stmt.body);
            }
            return {};
        }
    }

    private handleConditionBody(ctx: Context, body: Nodes.MacroBody): StatementEffect {
        if (!ctx.generateCode) {
            const name = body.token.cursor.inputName + `:ConditionOnLine${body.token.cursor.lineIdx + 1}`;
            const parser = new Parser(this.opts, name, body.token.body);
            body.parsed = parser.parseProgram();
        } else {
            if (!body.parsed) {
                throw Assembler.mkError("Condition was false in pass 1, now true -> Illegal", body);
            }
        }

        return { executeProgram: body.parsed };
    }

    private handleInvocation(ctx: Context, stmt: Nodes.Invocation): StatementEffect {
        return { executeProgram: stmt.program };
    }
}
