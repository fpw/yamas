/**
 *
 * Program: Statement | Statement Program
 *
 * Statement: OriginStatement | LabelDef | AssignStatement | ExpressionStatement | Comment | Text | StatementSeparator
 *  OriginStatement: *Expression
 *  LabelDef: Symbol,
 *  AssignStatement: Symbol=Expression
 *  ExpressionStatement: Expression
 *  Comment: /.*
 *  Text: TEXT ...
 *  StatementSeparator: ;|\n|EOF
 *
 * Expression: SymbolGroup | ParenExpr | BinaryOp | MacroBody | Element (but not symbol -> will be SymbolGroup)
 *  SymbolGroup: Symbol [Expression]
 *  ParenExpr: (Expression)? | [Expression]?
 *  BinaryOp: BinaryOp | Element Op Element
 *  MacroBody: <.*>
 *
 * Element: UnaryOp | Integer | Symbol | ASCII | .
 *  UnaryOp: -Element | +Element
 *  Integer: [0-9]+
 *  Symbol: [A-Z][A-Z0-9]+
 *  ASCII: ".
 *
 */

import { replaceBlanks } from "../utils/Strings";
import * as Tokens from "../lexer/Token";
import { CodeError } from "../utils/CodeError";

export enum NodeType {
    // Program
    Program,

    // Statement
    Origin,
    Label,
    Assignment,
    Separator,
    ExpressionStmt,
    Invocation,
    Comment,

    // Expression
    SymbolGroup,
    ParenExpr,
    BinaryOp,

    // Element
    UnaryOp,
    Integer,
    ASCIIChar,
    Symbol,
    CLCValue,

    // Pseudos
    Text,
    DoubleIntList,
    FloatList,
    Define,
    Eject,
    FixMri,
    FileName,
    Radix,
    PunchControl,
    FixTab,
    Expunge,
    ChangePage,
    ChangeField,
    Reloc,
    IfDef,
    IfNotDef,
    IfZero,
    IfNotZero,
    ZeroBlock,
    DeviceName,

    // Leaf only
    DoubleInt,
    Float,
    MacroBody,
}

export type Node =
    Program | Statement | Expression | Element |
    MacroBody | DoubleInt | Float;

export type Statement =
    PseudoStatement |
    OriginStatement | LabelDef | AssignStatement |
    ExpressionStatement | Invocation |
    Comment | StatementSeparator;

export type PseudoStatement =
    DataStatement |
    DefineStatement | EjectStatement | FixMriStatement |
    RadixStatement | PunchCtrlStatement | FixTabStatement | ExpungeStatement |
    IfZeroStatement | IfNotZeroStatement | IfDefStatement | IfNotDefStatement |
    ChangeFieldStatement | ChangePageStatement | RelocStatement;

export type DataStatement =
    TextStatement | FilenameStatement | DevNameStatement |
    ZBlockStatement | DoubleIntList | FloatList;

export type Expression =
    SymbolGroup | ParenExpr | BinaryOp | Element;

export type Element = UnaryOp | Integer | ASCIIChar | SymbolNode | CLCValue;

export interface BaseNode {
    type: NodeType;
}

export interface Program extends BaseNode {
    type: NodeType.Program;
    inputName: string;
    stmts: Statement[];
    errors: CodeError[];
}

// *200
export interface OriginStatement extends BaseNode {
    type: NodeType.Origin;
    val: Expression;
    token: Tokens.CharToken; // on *
}

// BEGIN, ...
export interface LabelDef {
    type: NodeType.Label;
    sym: SymbolNode;
    token: Tokens.CharToken; // on ,
}

// A=B
export interface AssignStatement extends BaseNode {
    type: NodeType.Assignment;
    sym: SymbolNode;
    val: Expression;
    token: Tokens.CharToken; // on =
}

// DEFINE M P1 P2 <body>
export interface DefineStatement extends BaseNode {
    type: NodeType.Define;
    name: SymbolNode;
    params: SymbolNode[];
    body: MacroBody;
    token: Tokens.SymbolToken; // on DEFINE
}

// M A1 A2 where M is macro
export interface Invocation extends BaseNode {
    type: NodeType.Invocation;
    name: SymbolNode;
    args: Tokens.MacroBodyToken[];
    program: Program;
}

// ;
export interface StatementSeparator extends BaseNode {
    type: NodeType.Separator;
    separator: ";" | "\n";
    token: Tokens.EOLToken | Tokens.SeparatorToken;
}

// DUBL
export type DublListMember = (DoubleInt | StatementSeparator | Comment);
export interface DoubleIntList extends BaseNode {
    type: NodeType.DoubleIntList;
    list: DublListMember[];
    token: Tokens.SymbolToken; // on DUBL
}

export interface DoubleInt extends BaseNode {
    type: NodeType.DoubleInt;
    unaryOp?: Tokens.CharToken;
    token: Tokens.IntegerToken;
}

// FLTG
export type FloatListMember = (Float | StatementSeparator | Comment);
export interface FloatList extends BaseNode {
    type: NodeType.FloatList;
    list: FloatListMember[];
    token: Tokens.SymbolToken; // on FLTG
}

export interface Float extends BaseNode {
    type: NodeType.Float;
    token: Tokens.FloatToken;
}

// TEXT x...x
export interface TextStatement extends BaseNode {
    type: NodeType.Text;
    str: Tokens.StringToken;
    token: Tokens.SymbolToken;
}

export interface IfDefStatement extends BaseNode {
    type: NodeType.IfDef;
    symbol: SymbolNode;
    body: MacroBody;
    token: Tokens.SymbolToken;
}

export interface IfNotDefStatement extends BaseNode {
    type: NodeType.IfNotDef;
    symbol: SymbolNode;
    body: MacroBody;
    token: Tokens.SymbolToken;
}

export interface IfZeroStatement extends BaseNode {
    type: NodeType.IfZero;
    expr: Expression;
    body: MacroBody;
    token: Tokens.SymbolToken;
}

export interface IfNotZeroStatement extends BaseNode {
    type: NodeType.IfNotZero;
    expr: Expression;
    body: MacroBody;
    token: Tokens.SymbolToken;
}

export interface EjectStatement extends BaseNode {
    type: NodeType.Eject;
    str: Tokens.StringToken;
    token: Tokens.SymbolToken;
}

export interface FilenameStatement extends BaseNode {
    type: NodeType.FileName;
    name: Tokens.StringToken;
    token: Tokens.SymbolToken; // on FILENAME
}

export interface RadixStatement extends BaseNode {
    type: NodeType.Radix;
    radix: 8 | 10;
    token: Tokens.SymbolToken; // on OCTAL / DECIMAL
}

export interface ZBlockStatement extends BaseNode {
    type: NodeType.ZeroBlock;
    expr: Expression;
    token: Tokens.SymbolToken; // on ZBLOCK
}

export interface DevNameStatement extends BaseNode {
    type: NodeType.DeviceName;
    name: SymbolNode;
    token: Tokens.SymbolToken; // on DEVICE
}

export interface ChangeFieldStatement extends BaseNode {
    type: NodeType.ChangeField;
    expr: Expression;
    token: Tokens.SymbolToken; // on FIELD
}

export interface ChangePageStatement extends BaseNode {
    type: NodeType.ChangePage;
    expr?: Expression;
    token: Tokens.SymbolToken; // on PAGE
}

export interface RelocStatement extends BaseNode {
    type: NodeType.Reloc;
    expr?: Expression;
    token: Tokens.SymbolToken; // on RELOC
}

export interface PunchCtrlStatement extends BaseNode {
    type: NodeType.PunchControl;
    enable: boolean;
    token: Tokens.SymbolToken; // on ENPUNCH / NOPUNCH
}

// /Comment
export interface Comment extends BaseNode {
    type: NodeType.Comment;
    token: Tokens.CommentToken;
}

// Symbol<blank>[Expression]
export interface SymbolGroup extends BaseNode {
    type: NodeType.SymbolGroup;
    first: SymbolNode;
    exprs: Expression[];
};

export interface ExpressionStatement extends BaseNode {
    type: NodeType.ExpressionStmt;
    expr: Expression;
}

export interface FixMriStatement extends BaseNode {
    type: NodeType.FixMri;
    assignment: AssignStatement;
    token: Tokens.SymbolToken; // on FIXMRI
}

export interface FixTabStatement extends BaseNode {
    type: NodeType.FixTab;
    token: Tokens.SymbolToken;
}

export interface ExpungeStatement extends BaseNode {
    type: NodeType.Expunge;
    token: Tokens.SymbolToken;
}

export interface ParenExpr extends BaseNode {
    type: NodeType.ParenExpr;
    paren: "(" | "[";
    expr: Expression;
    token: Tokens.CharToken;
}

// A + B
export interface BinaryOp extends BaseNode {
    type: NodeType.BinaryOp;
    lhs: BinaryOp | Element;
    operator: Tokens.BinaryOpChr;
    rhs: Element;
    token: Tokens.CharToken; // on op
}

// -2
export interface UnaryOp extends BaseNode {
    type: NodeType.UnaryOp;
    operator: Tokens.UnaryOpChr;
    elem: Element;
    token: Tokens.CharToken;
}

// < ... >
export interface MacroBody extends BaseNode {
    type: NodeType.MacroBody;
    parsed?: Program;
    token: Tokens.MacroBodyToken;
}

export interface Integer extends BaseNode {
    // unparsed because interpretation depends on environment (i.e. DECIMAL or OCTAL)
    type: NodeType.Integer;
    token: Tokens.IntegerToken;
}

export interface ASCIIChar extends BaseNode {
    type: NodeType.ASCIIChar;
    token: Tokens.ASCIIToken;
}

export interface SymbolNode extends BaseNode {
    type: NodeType.Symbol;
    token: Tokens.SymbolToken;
}

// .
export interface CLCValue extends BaseNode {
    type: NodeType.CLCValue;
    token: Tokens.CharToken;
}

export function dumpNode(prog: Program, write: (line: string) => void, indent = 0) {
    const w = (line: string, ind: number) => {
        const indStr = "".padStart(2 * ind);
        write(indStr + line);
    };

    w(`Program("${prog.inputName}"`, indent);
    for (const node of prog.stmts) {
        switch (node.type) {
            case NodeType.Invocation:
                const args = node.args.map(a => Tokens.tokenToString(a)).join(", ");
                w(`Invoke(${formatNode(node.name)}, [${args}], program=`, indent);
                dumpNode(node.program, write, indent + 1);
                w(")", indent);
                break;
            default:
                w(formatNode(node), indent + 1);
        }
    }
    w(")", indent);
}

// eslint-disable-next-line max-lines-per-function
export function formatNode(node: Node): string {
    let str;
    switch (node.type) {
        case NodeType.Origin:
            return `Origin(${formatNode(node.val)})`;
        case NodeType.Label:
            return `Label(${formatNode(node.sym)})`;
        case NodeType.Assignment:
            return `Assign(${formatNode(node.sym)}, ${formatNode(node.val)})`;
        case NodeType.Separator:
            return `Separator('${replaceBlanks(node.separator)}')`;
        case NodeType.ExpressionStmt:
            return `ExprStmt(${formatNode(node.expr)})`;
        case NodeType.Text:
            return `Text("${node.str.str}")`;
        case NodeType.Comment:
            return `Comment("${node.token.comment}")`;
        case NodeType.SymbolGroup:
            str = "Group(";
            str += `${formatNode(node.first)}, [`;
            str += node.exprs.map(n => formatNode(n)).join(", ");
            str += "])";
            return str;
        case NodeType.ParenExpr:
            return `Paren('${node.paren}', ${formatNode(node.expr)})`;
        case NodeType.Define:
            const params = node.params.map(a => formatNode(a)).join(", ");
            return `Define(${formatNode(node.name)}, [${params}], ${formatNode(node.body)})`;
        case NodeType.IfDef:
            return `IfDef(${formatNode(node.symbol)}, ${formatNode(node.body)})`;
        case NodeType.IfNotDef:
            return `IfNotDef(${formatNode(node.symbol)}, ${formatNode(node.body)})`;
        case NodeType.IfZero:
            return `IfZero(${formatNode(node.expr)}, ${formatNode(node.body)})`;
        case NodeType.IfNotZero:
            return `IfZero(${formatNode(node.expr)}, ${formatNode(node.body)})`;
        case NodeType.BinaryOp:
            return `BinOp(${formatNode(node.lhs)}, '${node.operator}', ${formatNode(node.rhs)})`;
        case NodeType.UnaryOp:
            return `Unary(${node.operator}, ${formatNode(node.elem)})`;
        case NodeType.Integer:
            return `Integer(${node.token.value})`;
        case NodeType.ASCIIChar:
            return `ASCII('${node.token.char}')`;
        case NodeType.Symbol:
            return `Symbol("${node.token.symbol}")`;
        case NodeType.DoubleIntList:
            return `DublList([${node.list.map(x => formatNode(x))}])`;
        case NodeType.DoubleInt:
            return `Dubl(${node.unaryOp ? node.unaryOp.char : ""}${node.token.value})`;
        case NodeType.FloatList:
            return `FltgList([${node.list.map(x => formatNode(x))}}])`;
        case NodeType.Float:
            return `Float(${node.token.float})`;
        case NodeType.ZeroBlock:
            return `ZeroBlock(${formatNode(node.expr)})`;
        case NodeType.DeviceName:
            return `DeviceName("${node.name.token.symbol}")`;
        case NodeType.CLCValue:
            return "CLC()";
        case NodeType.MacroBody:
            return `MacroBody("${replaceBlanks(Tokens.tokenToString(node.token))}")`;
        case NodeType.FileName:
            return `Filename("${node.name.str}")`;
        case NodeType.Eject:
            return `Eject("${node.str.str}")`;
        case NodeType.Radix:
            return `Radix(${node.radix})`;
        case NodeType.FixTab:
            return "FixTab()";
        case NodeType.ChangeField:
            return `ChangeField(${formatNode(node.expr)})`;
        case NodeType.ChangePage:
            return `ChangePage(${node.expr ? formatNode(node.expr) : ""})`;
        case NodeType.Reloc:
            return `Reloc(${node.expr ? formatNode(node.expr) : ""})`;
        case NodeType.Expunge:
            return "Expunge()";
        case NodeType.PunchControl:
            return `PunchCtrl(enable=${node.enable})`;
        case NodeType.FixMri:
            return `FixMri("${formatNode(node.assignment)}")`;
        case NodeType.Invocation:
        case NodeType.Program:
            throw Error("Can't handle compound");
    }
}
