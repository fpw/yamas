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
import { AssemblerOptions } from "../Assembler.js";
import { StatementEffect, StatementHandler } from "../util/StatementEffect.js";
import { Context } from "../Context.js";
import { SymbolTable } from "../SymbolTable.js";
import { ExprEvaluator } from "../util/ExprEvaluator.js";

export class SymbolAssembler {
    public opts: AssemblerOptions;
    private syms: SymbolTable;
    public evaluator: ExprEvaluator;

    public constructor(opts: AssemblerOptions, syms: SymbolTable, evaluator: ExprEvaluator) {
        this.opts = opts;
        this.syms = syms;
        this.evaluator = evaluator;
    }

    public get handlers(): [NodeType, StatementHandler][] {
        return [
            [NodeType.Assignment, (ctx, stmt) => this.handleAssignment(ctx, stmt as Nodes.AssignStatement)],
            [NodeType.FixMri, (ctx, stmt) => this.handleFixMri(ctx, stmt as Nodes.FixMriStatement)],
            [NodeType.Label, (ctx, stmt) => this.handleLabel(ctx, stmt as Nodes.LabelDef)],
            [NodeType.FixTab, (ctx, stmt) => this.handleFixTab(ctx, stmt as Nodes.FixTabStatement)],
            [NodeType.Expunge, (ctx, stmt) => this.handleExpunge(ctx, stmt as Nodes.ExpungeStatement)],
        ];
    }

    private handleLabel(ctx: Context, stmt: Nodes.LabelDef): StatementEffect {
        this.syms.defineLabel(stmt.sym.token.symbol, ctx.getClc(true));
        return {};
    }

    private handleFixMri(ctx: Context, stmt: Nodes.FixMriStatement): StatementEffect {
        const val = this.evaluator.safeEval(ctx, stmt.assignment.val);
        this.syms.defineForcedMri(stmt.assignment.sym.token.symbol, val);
        return {};
    }

    private handleAssignment(ctx: Context, stmt: Nodes.AssignStatement): StatementEffect {
        const paramVal = this.evaluator.tryEval(ctx, stmt.val);

        // undefined expressions lead to undefined symbols
        if (paramVal !== null) {
            this.syms.defineParameter(stmt.sym.token.symbol, paramVal);
        }

        return {};
    }

    private handleFixTab(ctx: Context, stmt: Nodes.FixTabStatement): StatementEffect {
        if (!ctx.generateCode) {
            this.syms.fix();
        }
        return {};
    }

    private handleExpunge(ctx: Context, stmt: Nodes.ExpungeStatement): StatementEffect {
        if (!ctx.generateCode) {
            this.syms.expunge();
        }
        return {};
    }
}
