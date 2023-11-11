#!/usr/bin/env node
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

import { readFileSync, writeFileSync } from "fs";
import { tracks, defaultCSS } from "peggy-tracks";
import { Diagram } from "peggy-tracks/types/vendor/railroad-diagrams/railroad.js";

const drawList = [
    "Program",
    "Statement", "Origin", "Label", "Assign", "ExpressionStmt", "Separator", "Invocation", "Comment", "PseudoStatement",
    "Expression", "ParenExpr", "SymbolGroup", "BinaryOp", "BinOpFragment", "BinaryOperator",
    "MacroBody", "InnerMacroBody", "Float", "Element", "Integer", "Symbol", "Macro", "SymbolName", "CLC", "ASCII",
    "EOL", "EOF", "OriginPseudo", "Page", "Field", "Reloc", "SymbolTablePseudo", "FixMri", "FixTab", "Expunge",
    "RadixPseudo", "Decimal", "Octal", "MacroPseudo", "Define", "IfDef", "IfNDef", "IfZero", "IfNZro", "DataPseudo",
    "ZBlock", "Text", "Dubl", "Fltg", "Device", "FileName", "OutputCtrlPseudo", "EnPunch", "NoPunch", "Eject", "Param",
    "NeutralListElement", "StringContent", "IntWithUnary",
];

const grammar = readFileSync("docs/yamas.peggy", "utf-8");

for (const entry of drawList) {
    const diagram = tracks({
        text: grammar,
        start: entry,
        parserOptions: {
        },
        action: false,
    }) as Diagram;

    const svg = diagram.toStandalone(defaultCSS) as string;
    writeFileSync(`docs/diagrams/${entry}.svg`, svg);
}
