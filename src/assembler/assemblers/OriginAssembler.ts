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
import * as PDP8 from "../../utils/PDP8.js";
import { AssemblerOptions } from "../Assembler.js";
import { Context } from "../Context.js";
import { ExprEvaluator } from "../util/ExprEvaluator.js";
import { RegisterFunction, StatementEffect } from "../util/StatementEffect.js";

/**
 * Assembler for statements to origin changes.
 */
export class OriginAssembler {
    public opts: AssemblerOptions;
    public evaluator: ExprEvaluator;

    public constructor(opts: AssemblerOptions, evaluator: ExprEvaluator) {
        this.opts = opts;
        this.evaluator = evaluator;
    }

    public registerHandlers(register: RegisterFunction) {
        register(NodeType.ChangePage, this.handlePage.bind(this));
        register(NodeType.ChangeField, this.handleField.bind(this));
        register(NodeType.Reloc, this.handleReloc.bind(this));
        register(NodeType.Origin, this.handleOrigin.bind(this));
    }

    private handleOrigin(ctx: Context, stmt: Nodes.OriginStatement): StatementEffect {
        const newClc = this.evaluator.safeEval(ctx, stmt.val);
        return { relocClc: newClc };
    }

    private handlePage(ctx: Context, stmt: Nodes.ChangePageStatement): StatementEffect {
        let newPage: number;
        if (!stmt.expr) {
            // subtracting 1 because the cursor is already at the next statement
            const curPage = PDP8.calcPageNum(ctx.getClc(true) - 1);
            newPage = curPage + 1;
        } else {
            newPage = this.evaluator.safeEval(ctx, stmt.expr);
            if (newPage < 0 || newPage >= PDP8.NumPages) {
                throw Nodes.mkNodeError(`Invalid page ${newPage}`, stmt);
            }
        }
        const reloc = PDP8.firstAddrInPage(newPage);
        return { relocClc: reloc };
    }

    private handleField(ctx: Context, stmt: Nodes.ChangeFieldStatement): StatementEffect {
        const field = this.evaluator.safeEval(ctx, stmt.expr);
        if (field < 0 || field >= PDP8.NumFields) {
            throw Nodes.mkNodeError(`Invalid field ${field}`, stmt);
        }
        if (ctx.reloc) {
            throw Nodes.mkNodeError("Changing FIELD with active reloc not supported", stmt);
        }

        return { changeField: field };
    }

    private handleReloc(ctx: Context, stmt: Nodes.RelocStatement): StatementEffect {
        if (!stmt.expr) {
            ctx.reloc = 0;
        } else {
            const reloc = this.evaluator.safeEval(ctx, stmt.expr);
            ctx.reloc = reloc - ctx.getClc(false);
        }
        return {};
    }
}
