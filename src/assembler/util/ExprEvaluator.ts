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
import * as PDP8 from "../../utils/PDP8.js";
import { parseIntSafe } from "../../utils/Strings.js";
import { AssemblerOptions } from "../Assembler.js";
import { AssemblerError } from "../AssemblerError.js";
import { Context } from "../Context.js";
import { LinkTable } from "../LinkTable.js";
import { SymbolType } from "../SymbolData.js";
import { SymbolTable } from "../SymbolTable.js";

/**
 * Class to evaluate expressions.
 * Note that evaluating an expression can have side effects:
 *  - an expression like (2) needs to evaluate to a link address, so a link must be generated
 *  - likewise, "TAD 1234" is an expression that might need to create a link
 *
 * An expression can contain undefined symbols. tryEval returns null if an expression is undefined
 * while safeEval throws on undefined expressions.
 *
 */
export class ExprEvaluator {
    public constructor(private opts: AssemblerOptions, private syms: SymbolTable, private linkTable: LinkTable) {
    }

    public safeEval(ctx: Context, expr: Nodes.Expression): number {
        const val = this.tryEval(ctx, expr);
        if (val === null) {
            throw new AssemblerError("Undefined expression", expr);
        }
        return val;
    }

    public tryEval(ctx: Context, expr: Nodes.Expression): number | null {
        switch (expr.type) {
            case NodeType.Element:      return this.evalElement(ctx, expr);
            case NodeType.ParenExpr:    return this.evalParenExpr(ctx, expr);
            case NodeType.SymbolGroup:  return this.evalSymbolGroup(ctx, expr);
            case NodeType.BinaryOp:     return this.evalBinOp(ctx, expr);
        }
    }

    private evalElement(ctx: Context, elem: Nodes.Element): number | null {
        let nodeVal: number | null;
        switch (elem.node.type) {
            case NodeType.Integer:      nodeVal = parseIntSafe(elem.node.value, ctx.radix); break;
            case NodeType.ASCIIChar:    nodeVal = CharSets.asciiCharTo7Bit(elem.node.char, true); break;
            case NodeType.Symbol:       nodeVal = nodeVal = this.evalSymbol(ctx, elem.node); break;
            case NodeType.CLCValue:     nodeVal = ctx.getClc(true); break;
        }

        if (nodeVal === null) {
            return null;
        } else if (elem.unaryOp?.operator == "-") {
            nodeVal = -nodeVal;
        }

        return (nodeVal & 0o7777);
    }

    private evalSymbol(ctx: Context, node: Nodes.SymbolNode): number | null {
        const sym = this.syms.tryLookup(node.name);
        if (!sym) {
            return null;
        }

        if (sym.type != SymbolType.Permanent && sym.type != SymbolType.Label && sym.type != SymbolType.Param) {
            throw new AssemblerError("Expected a label or param symbol", node);
        }
        return sym.value;
    }

    private evalSymbolGroup(ctx: Context, group: Nodes.SymbolGroup): number | null {
        if (this.isMRIExpr(group)) {
            return this.evalMRI(ctx, group);
        }

        // not an MRI but spaces in expr: OR all operands
        let acc = this.tryEval(ctx, group.first);

        for (const e of group.exprs) {
            let val;
            if (e.type == NodeType.BinaryOp && acc !== null) {
                // the accumulator input is used for a syntax like CDF 1+1 -> must eval as ((CFD OR 1) + 1)
                acc = this.evalBinOpAcc(ctx, e, acc);
            } else {
                val = this.tryEval(ctx, e);
                if (val === null || acc === null) {
                    acc = null;
                } else {
                    acc |= val;
                }
            }
        }
        return acc;
    }

    private evalMRI(ctx: Context, group: Nodes.SymbolGroup): number | null {
        if (group.first.node.type != NodeType.Symbol) {
            throw new AssemblerError("Tried to evaluate MRI group with non-MRI", group);
        }

        const mri = this.syms.lookup(group.first.node.name);
        if (mri.type != SymbolType.Param) {
            throw new AssemblerError("MRI group symbol is not an param symbol", group);
        }

        // It's allowed to have a negative MRI such as -TAD. Then the value is -TAD according
        // to PAL8. However, that's not allowed if any other operand is OR-ed after the space, e.g.
        // -TAD 5 is illegal.
        // Ergo: It's not treated like a non-MRI because it's not allowed to have any parameter.
        // But it's also not a real MRI because we never encode any real destination.
        if (group.first.unaryOp !== undefined) {
            if (group.exprs.length > 0) {
                throw new AssemblerError("MRI expression with parameters is illegal with parameters", group);
            }
            return (group.first.unaryOp.operator == "-" ?  -mri.value : mri.value) & 0o7777;
        }

        return this.buildMRI(ctx, mri.value, group.exprs);
    }

    // build an MRI operation from the start symbol and its operands
    private buildMRI(ctx: Context, mriVal: number, exprs: Nodes.Expression[]) {
        // full 12 bits destination
        let dstVal = 0;

        for (let i = 0; i < exprs.length; i++) {
            const ex = exprs[i];
            if (ex.type == NodeType.Element && ex.node.type == NodeType.Symbol) {
                const sym = this.syms.tryLookup(ex.node.name);
                if (!sym) {
                    return null;
                } else if (sym.type == SymbolType.Permanent) {
                    // permanent symbols are only allowed as first symbol after the MRI, otherwise they act on dst
                    if (i == 0) {
                        mriVal |= sym.value;
                    } else {
                        // TODO: Warning
                        dstVal |= sym.value;
                    }
                } else if (sym.type == SymbolType.Label || sym.type == SymbolType.Param) {
                    dstVal |= sym.value;
                } else {
                    throw new AssemblerError(`Unexpected symbol type ${sym.name} -> ${SymbolType[sym.type]}`, ex);
                }
            } else {
                const val = this.tryEval(ctx, ex);
                if (val === null) {
                    return null;
                }
                dstVal |= val;
            }
        }

        // now build a single operation for the 12 bit destination
        return this.genMRI(ctx, mriVal, dstVal);
    }

    // 5 bits MRI + 12 bits destination to 5 + 7 bits by adding links or dst being on page or on page zero
    private genMRI(ctx: Context, mri: number, dst: number): number {
        const IND   = 0b000100000000;
        const CUR   = 0b000010000000;

        const effVal = mri | (dst & 0b1111111);

        const curPage = PDP8.calcPageNum(ctx.getClc(true));
        const dstPage = PDP8.calcPageNum(dst);
        if (dstPage == 0) {
            return effVal;
        } else if (curPage == dstPage) {
            return effVal | CUR;
        } else {
            if (mri & IND) {
                throw Error(`Double indirection on page ${curPage}"`);
            }
            const linkPage = PDP8.calcPageNum(ctx.getClc(false));
            const indAddr = this.linkTable.enter(ctx, linkPage, dst);
            return mri | (indAddr & 0b1111111) | IND | CUR;
        }
    }

    private evalParenExpr(ctx: Context, expr: Nodes.ParenExpr): number | null {
        const val = this.tryEval(ctx, expr.expr);
        if (val === null) {
            return null;
        }

        if (expr.paren == "(") {
            const linkPage = PDP8.calcPageNum(ctx.getClc(false));
            return this.linkTable.enter(ctx, linkPage, val);
        } else if (expr.paren == "[") {
            return this.linkTable.enter(ctx, 0, val);
        } else {
            throw new AssemblerError(`Invalid parentheses: "${expr.paren}"`, expr);
        }
    }

    private evalBinOp(ctx: Context, binOp: Nodes.BinaryOp): number | null {
        const lhs = this.tryEval(ctx, binOp.lhs);
        const rhs = this.tryEval(ctx, binOp.rhs);
        return this.calcOp(binOp, lhs, rhs);
    }

    private evalBinOpAcc(ctx: Context, binOp: Nodes.BinaryOp, acc: number): number | null {
        let lhs;
        if (binOp.lhs.type == NodeType.BinaryOp) {
            lhs = this.evalBinOpAcc(ctx, binOp.lhs, acc);
        } else {
            lhs = this.tryEval(ctx, binOp.lhs);
            if (lhs !== null) {
                lhs |= acc;
            }
        }
        const rhs = this.tryEval(ctx, binOp.rhs);
        return this.calcOp(binOp, lhs, rhs);
    }

    private calcOp(binOp: Nodes.BinaryOp, lhs: number | null, rhs: number | null): number | null {
        if (lhs === null || rhs === null) {
            return null;
        }

        if (binOp.operator == "%" && rhs == 0) {
            // as per PAL8
            return 0;
        }

        switch (binOp.operator) {
            case "+":   return (lhs + rhs) & 0o7777;
            case "-":   return (lhs - rhs) & 0o7777;
            case "^":   return (lhs * rhs) & 0o7777;
            case "%":   return (lhs / rhs) & 0o7777;
            case "!":   return !this.opts.orDoesShift ? (lhs | rhs) : ((lhs << 6) | rhs) & 0o7777;
            case "&":   return lhs & rhs;
        }
    }

    private isMRIExpr(expr: Nodes.Expression): boolean {
        // An MRI expression needs to start with an MRI op followed by a space -> group with symbol
        if (expr.type != NodeType.SymbolGroup || expr.first.node.type != NodeType.Symbol) {
            return false;
        }

        const sym = this.syms.tryLookup(expr.first.node.name);
        if (!sym || sym.type != SymbolType.Param || !sym.fixed) {
            return false;
        }

        return sym.forcedMri || PDP8.isMRIOp(sym.value);
    }
}
