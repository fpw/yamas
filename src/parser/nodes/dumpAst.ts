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
import { replaceNonPrints } from "../../utils/Strings.js";
import * as Nodes from "./Node.js";

export function dumpAst(prog: Nodes.Program, write: (line: string) => void, indent = 0) {
    const writeIndented = (ex: CursorExtent | undefined, line: string, ind: number) => {
        const indStr = "".padStart(2 * ind);
        if (ex) {
            // indStr += `${ex.cursor.lineIdx + 1}:${ex.cursor.colIdx + 1}-${ex.cursor.colIdx + 1 + ex.width}: `;
        }
        write(indStr + line);
    };

    writeIndented(prog.extent, `Program("${prog.inputName}"`, indent);
    for (const node of prog.instructions) {
        if (!node.statement) {
            continue;
        }
        const stmt = node.statement;
        for (const label of node.labels) {
            writeIndented(label.extent, formatNode(label), indent + 1);
        }
        switch (stmt.type) {
            case Nodes.NodeType.Invocation:
                const args = stmt.args.join(", ");
                writeIndented(stmt.macro.extent, `Invoke(${formatNode(stmt.macro)}, [${args}], program=`, indent + 1);
                dumpAst(stmt.program, write, indent + 2);
                writeIndented(undefined, ")", indent + 1);
                break;
            default:
                writeIndented(stmt.extent, formatNode(stmt), indent + 1);
        }
        writeIndented(node.separator.extent, formatNode(node.separator), indent + 1);
    }
    writeIndented(undefined, ")", indent);
}

// eslint-disable-next-line max-lines-per-function
export function formatNode(node: Nodes.Node): string {
    let str;
    switch (node.type) {
        case Nodes.NodeType.Origin:
            return `Origin(${formatNode(node.val)})`;
        case Nodes.NodeType.Label:
            return `Label(${formatNode(node.sym)})`;
        case Nodes.NodeType.Assignment:
            return `Assign(${formatNode(node.sym)}, ${formatNode(node.val)})`;
        case Nodes.NodeType.Separator:
            return `Separator('${replaceNonPrints(node.separator)}')`;
        case Nodes.NodeType.ExpressionStmt:
            return `ExprStmt(${formatNode(node.expr)})`;
        case Nodes.NodeType.Text:
            return `Text("${node.text}")`;
        case Nodes.NodeType.Comment:
            return `Comment("${node.comment}")`;
        case Nodes.NodeType.Integer:
            return `Integer(${node.value})`;
        case Nodes.NodeType.ASCIIChar:
            return `ASCII('${node.char}')`;
        case Nodes.NodeType.Symbol:
            return `Symbol("${node.name}")`;
        case Nodes.NodeType.CLCValue:
            return "CLC()";
        case Nodes.NodeType.ExprGroup:
            str = "Group([";
            str += node.exprs.map(n => formatNode(n)).join(", ");
            str += "])";
            return str;
        case Nodes.NodeType.ParenExpr:
            return `Paren('${node.paren}', ${formatNode(node.expr)})`;
        case Nodes.NodeType.Define:
            const params = node.params.map(a => formatNode(a)).join(", ");
            return `Define(${formatNode(node.macro)}, [${params}], ${formatNode(node.body)})`;
        case Nodes.NodeType.IfDef:
            return `IfDef(${formatNode(node.symbol)}, ${formatNode(node.body)})`;
        case Nodes.NodeType.IfNotDef:
            return `IfNotDef(${formatNode(node.symbol)}, ${formatNode(node.body)})`;
        case Nodes.NodeType.IfZero:
            return `IfZero(${formatNode(node.expr)}, ${formatNode(node.body)})`;
        case Nodes.NodeType.IfNotZero:
            return `IfZero(${formatNode(node.expr)}, ${formatNode(node.body)})`;
        case Nodes.NodeType.BinaryOp:
            return `BinOp(${formatNode(node.lhs)}, '${node.operator}', ${formatNode(node.rhs)})`;
        case Nodes.NodeType.DoubleIntList:
            return `DublList([${node.list.map(x => formatNode(x))}])`;
        case Nodes.NodeType.DoubleInt:
            return `Dubl(${node.unaryOp?.operator ?? ""}${node.value})`;
        case Nodes.NodeType.FloatList:
            return `FltgList([${node.list.map(x => formatNode(x))}}])`;
        case Nodes.NodeType.Float:
            return `Float(${node.unaryOp?.operator ?? ""}${node.value})`;
        case Nodes.NodeType.ZeroBlock:
            return `ZeroBlock(${formatNode(node.expr)})`;
        case Nodes.NodeType.DeviceName:
            return `DeviceName("${node.name}")`;
        case Nodes.NodeType.MacroBody:
            return `MacroBody("${replaceNonPrints(node.code)}")`;
        case Nodes.NodeType.FileName:
            return `Filename("${node.name}")`;
        case Nodes.NodeType.Eject:
            return `Eject("${node.text ? node.text : ""}")`;
        case Nodes.NodeType.XList:
            return "XList()";
        case Nodes.NodeType.Pause:
            return "Pause()";
        case Nodes.NodeType.Radix:
            return `Radix(${node.radix})`;
        case Nodes.NodeType.FixTab:
            return "FixTab()";
        case Nodes.NodeType.ChangeField:
            return `ChangeField(${node.expr ? formatNode(node.expr) : ""})`;
        case Nodes.NodeType.ChangePage:
            return `ChangePage(${node.expr ? formatNode(node.expr) : ""})`;
        case Nodes.NodeType.Reloc:
            return `Reloc(${node.expr ? formatNode(node.expr) : ""})`;
        case Nodes.NodeType.Expunge:
            return "Expunge()";
        case Nodes.NodeType.PunchControl:
            return `PunchCtrl(enable=${node.enable})`;
        case Nodes.NodeType.FixMri:
            return `FixMri("${formatNode(node.assignment)}")`;
        case Nodes.NodeType.Element:
            return `Element(${node.unaryOp?.operator ?? ""}${formatNode(node.node)})`;
        case Nodes.NodeType.Invocation:
        case Nodes.NodeType.Instruction:
        case Nodes.NodeType.Program:
            throw Error("Can't handle compound");
    }
}
