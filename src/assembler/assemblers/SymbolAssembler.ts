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
import { SubComponents } from "../Assembler.js";
import { Context } from "../Context.js";
import { SymbolTable } from "../SymbolTable.js";
import { ExprEvaluator } from "../util/ExprEvaluator.js";
import { RegisterFunction, StatementEffect } from "../util/StatementEffect.js";

/**
 * Assembler for statements related to symbol table manipulation.
 */
export class SymbolAssembler {
    private syms: SymbolTable;
    private evaluator: ExprEvaluator;

    public constructor(components: SubComponents) {
        this.syms = components.symbols;
        this.evaluator = components.evaluator;
    }

    public registerStatements(register: RegisterFunction) {
        register(NodeType.Assignment, this.handleAssignment.bind(this));
        register(NodeType.FixMri, this.handleFixMri.bind(this));
        register(NodeType.Label, this.handleLabel.bind(this));
        register(NodeType.FixTab, this.handleFixTab.bind(this));
        register(NodeType.Expunge, this.handleExpunge.bind(this));
    }

    private handleLabel(ctx: Context, stmt: Nodes.LabelDef): StatementEffect {
        this.syms.defineLabel(stmt.sym.name, ctx.getClc(true));
        return {};
    }

    private handleFixMri(ctx: Context, stmt: Nodes.FixMriStatement): StatementEffect {
        const val = this.evaluator.safeEval(ctx, stmt.assignment.val);
        this.syms.defineForcedMri(stmt.assignment.sym.name, val);
        return {};
    }

    private handleAssignment(ctx: Context, stmt: Nodes.AssignStatement): StatementEffect {
        const paramVal = this.evaluator.tryEval(ctx, stmt.val);

        // only assign non-null: undefined expressions lead to undefined symbols
        if (paramVal !== null) {
            this.syms.defineParameter(stmt.sym.name, paramVal);
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
