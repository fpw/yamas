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

import { BaseNode, NodeType, Statement, SymbolNode } from "./Node.js";

export interface Instruction extends BaseNode {
    type: NodeType.Instruction;
    labels: LabelDef[];
    statement?: Statement;
    comment?: Comment;
    end: StatementSeparator;
}

// BEGIN, ...
export interface LabelDef extends BaseNode {
    type: NodeType.Label;
    sym: SymbolNode;
}

// ;
export interface StatementSeparator extends BaseNode {
    type: NodeType.Separator;
    separator: ";" | "\n" | "EOF";
}

// /Comment
export interface Comment extends BaseNode {
    type: NodeType.Comment;
    comment: string;
}
