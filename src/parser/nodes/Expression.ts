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

import { BinaryOpChr } from "../../lexer/Token.js";
import { Element } from "./Element.js";
import { BaseNode, NodeType } from "./Node.js";

export type Expression = ExprGroup | BasicExpr;
export type BasicExpr = ParenExpr | BinaryOp | Element;

// expr <space> expr ... -> at least two exprs
export interface ExprGroup extends BaseNode {
    type: NodeType.ExprGroup;
    exprs: BasicExpr[];
};

// (9), [TAD]
export interface ParenExpr extends BaseNode {
    type: NodeType.ParenExpr;
    paren: "(" | "[";
    expr: Expression;
}

// A+B!C...
export interface BinaryOp extends BaseNode {
    type: NodeType.BinaryOp;
    lhs: BinaryOp | ParenExpr | Element;
    operator: BinaryOpChr;
    rhs: ParenExpr | Element;
}
