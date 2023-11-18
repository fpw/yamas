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

import { SymbolNode } from "./Element.js";
import { Expression } from "./Expression.js";
import { BaseNode, NodeType, Program } from "./Node.js";
import { PseudoStatement } from "./PseudoStatement.js";

export type Statement =
    PseudoStatement |
    OriginStatement | AssignStatement |
    ExpressionStatement | Invocation;

// *200
export interface OriginStatement extends BaseNode {
    type: NodeType.Origin;
    val: Expression;
}

// A=B
export interface AssignStatement extends BaseNode {
    type: NodeType.Assignment;
    sym: SymbolNode;
    val: Expression;
}

// an expression as a data-generating statement
export interface ExpressionStatement extends BaseNode {
    type: NodeType.ExpressionStmt;
    expr: Expression;
}

// M A1, A2 where M is macro
export interface Invocation extends BaseNode {
    type: NodeType.Invocation;
    macro: SymbolNode;
    args: string[];
    program: Program;
}
