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

export type MacroStatement =
    DefineStatement |
    IfZeroStatement | IfNotZeroStatement |
    IfDefStatement | IfNotDefStatement;

// DEFINE M P1 P2 <body>
export interface DefineStatement extends BaseNode {
    type: NodeType.Define;
    macro: SymbolNode;
    params: SymbolNode[];
    body: MacroBody;
}

// IFDEF
export interface IfDefStatement extends BaseNode {
    type: NodeType.IfDef;
    symbol: SymbolNode;
    body: MacroBody;
}

// IFNDEF
export interface IfNotDefStatement extends BaseNode {
    type: NodeType.IfNotDef;
    symbol: SymbolNode;
    body: MacroBody;
}

// IFZERO
export interface IfZeroStatement extends BaseNode {
    type: NodeType.IfZero;
    expr: Expression;
    body: MacroBody;
}

// IFNZRO
export interface IfNotZeroStatement extends BaseNode {
    type: NodeType.IfNotZero;
    expr: Expression;
    body: MacroBody;
}

// < ... >
export interface MacroBody extends BaseNode {
    type: NodeType.MacroBody;
    code: string;

    parsed?: Program; // cache for assembler, TODO: move somewhere else
}
