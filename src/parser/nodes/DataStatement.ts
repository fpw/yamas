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

import { UnaryOp } from "./Element.js";
import { Expression } from "./Expression.js";
import { BaseNode, Comment, NodeType, StatementSeparator } from "./Node.js";

export type DataStatement =
    TextStatement | FilenameStatement | DevNameStatement |
    ZBlockStatement | DoubleIntList | FloatList;

// TEXT x...x
export interface TextStatement extends BaseNode {
    type: NodeType.Text;
    text: string;
}

// ZBLOCK
export interface ZBlockStatement extends BaseNode {
    type: NodeType.ZeroBlock;
    expr: Expression;
}

// FILENAME
export interface FilenameStatement extends BaseNode {
    type: NodeType.FileName;
    name: string;
}

// DEVICE
export interface DevNameStatement extends BaseNode {
    type: NodeType.DeviceName;
    name: string;
}

// DUBL
export type DublListMember = (DoubleInt | StatementSeparator | Comment);
export interface DoubleIntList extends BaseNode {
    type: NodeType.DoubleIntList;
    list: DublListMember[];
}

export interface DoubleInt extends BaseNode {
    type: NodeType.DoubleInt;
    unaryOp?: UnaryOp;
    value: string; // not including unary
}

// FLTG
export type FloatListMember = (Float | StatementSeparator | Comment);
export interface FloatList extends BaseNode {
    type: NodeType.FloatList;
    list: FloatListMember[];
}

export interface Float extends BaseNode {
    type: NodeType.Float;
    unaryOp?: UnaryOp;
    value: string; // not including unary
}
