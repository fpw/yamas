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

import { CursorExtent } from "../../lexer/Cursor.js";
import { CodeError } from "../../utils/CodeError.js";
import { DoubleInt, Float } from "./DataStatement.js";
import { Element, ElementType } from "./Element.js";
import { Expression } from "./Expression.js";
import { MacroBody } from "./MacroStatement.js";
import { Statement } from "./Statement.js";

export * from "./DataStatement.js";
export * from "./Element.js";
export * from "./Expression.js";
export * from "./MacroStatement.js";
export * from "./PseudoStatement.js";
export * from "./Statement.js";

export enum NodeType {
    // Program
    Program,

    // Statement
    Origin, Label, Assignment,
    ExpressionStmt, Invocation,
    Separator, Comment,

    // Expression
    SymbolGroup, ParenExpr, BinaryOp,

    // Elements
    Element,
    UnaryOp, Integer, ASCIIChar, CLCValue, Symbol,

    // Origin
    ChangePage, ChangeField, Reloc,
    // Data
    ZeroBlock, Text, DoubleIntList, FloatList, FileName, DeviceName, Radix,
    // Macro
    Define, IfDef, IfNotDef, IfZero, IfNotZero,
    // Symbols
    FixMri, FixTab, Expunge,
    Eject, PunchControl, XList, Pause,

    // Leaf only
    DoubleInt,
    Float,
    MacroBody,
}

export type Node =
    Program | Statement | Expression | Element |
    MacroBody | DoubleInt | Float | ElementType;

export interface BaseNode {
    type: NodeType;
    extent: CursorExtent;
}

export interface Program extends BaseNode {
    type: NodeType.Program;
    inputName: string;
    stmts: Statement[];
    errors: CodeError[];
}
