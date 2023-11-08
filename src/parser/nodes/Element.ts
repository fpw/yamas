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

import { UnaryOpChr } from "../../lexer/Token.js";
import { BaseNode, NodeType } from "./Node.js";

export type ElementType = Integer | ASCIIChar | SymbolNode | CLCValue;

export interface Element extends BaseNode {
    type: NodeType.Element;
    unaryOp?: UnaryOp;
    node: ElementType;
}

// -2
export interface UnaryOp extends BaseNode {
    type: NodeType.UnaryOp;
    operator: UnaryOpChr;
}

export interface Integer extends BaseNode {
    // unparsed because interpretation depends on environment (i.e. DECIMAL or OCTAL)
    type: NodeType.Integer;
    value: string;
}

export interface ASCIIChar extends BaseNode {
    type: NodeType.ASCIIChar;
    char: string;
}

export interface SymbolNode extends BaseNode {
    type: NodeType.Symbol;
    name: string;
}

// .
export interface CLCValue extends BaseNode {
    type: NodeType.CLCValue;
}
