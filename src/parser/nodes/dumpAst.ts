import { tokenToString } from "../../lexer/formatToken.js";
import { replaceBlanks } from "../../utils/Strings.js";
import * as Nodes from "./Node.js";

export function dumpAst(prog: Nodes.Program, write: (line: string) => void, indent = 0) {
    const w = (line: string, ind: number) => {
        const indStr = "".padStart(2 * ind);
        write(indStr + line);
    };

    w(`Program("${prog.inputName}"`, indent);
    for (const node of prog.stmts) {
        switch (node.type) {
            case Nodes.NodeType.Invocation:
                const args = node.args.map(a => tokenToString(a)).join(", ");
                w(`Invoke(${formatNode(node.macro)}, [${args}], program=`, indent);
                dumpAst(node.program, write, indent + 1);
                w(")", indent);
                break;
            default:
                w(formatNode(node), indent + 1);
        }
    }
    w(")", indent);
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
            return `Separator('${replaceBlanks(node.separator)}')`;
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
        case Nodes.NodeType.SymbolGroup:
            str = "Group(";
            str += `${formatNode(node.first)}, [`;
            str += node.exprs.map(n => formatNode(n)).join(", ");
            str += "])";
            return str;
        case Nodes.NodeType.ParenExpr:
            return `Paren('${node.paren}', ${formatNode(node.expr)})`;
        case Nodes.NodeType.Define:
            const params = node.params.map(a => formatNode(a)).join(", ");
            return `Define(${formatNode(node.name)}, [${params}], ${formatNode(node.body)})`;
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
            return `MacroBody("${replaceBlanks(node.code)}")`;
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
            return `ChangeField(${formatNode(node.expr)})`;
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
        case Nodes.NodeType.Program:
            throw Error("Can't handle compound");
    }
}
