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

export enum NodeType {
    // Program
    Program,

    // Statement
    Origin,
    Label,
    Assignment,
    Separator,
    ExpressionStmt,
    Define,
    Invocation,
    Text,
    DoubleIntList,
    FloatList,
    Comment,
    Eject,
    FixMri,

    // Expression
    SymbolGroup,
    ParenExpr,
    BinaryOp,
    MacroBody,

    // Element
    UnaryOp,
    Integer,
    ASCIIChar,
    Symbol,
    CLCValue,

    // Specials
    DoubleInt,
    Float,
}

export type Node = Program | Statement | Expression | Element;

export type Statement =
    OriginStatement |
    ExpressionStatement | LabelDef | AssignStatement |
    DefineStatement | Invocation |
    TextStatement | DoubleIntList | FloatList | Comment | StatementSeparator |
    EjectStatement | FixMriStatement;

export type Expression =
    SymbolGroup | ParenExpr | BinaryOp |
    MacroBody | Element;

export type Element = UnaryOp | Integer | ASCIIChar | SymbolNode | CLCValue;

export interface BaseNode {
    type: NodeType;
}

export interface Program extends BaseNode {
    type: NodeType.Program;
    stmts: Statement[];
    inputName: string;
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
    delim: string;
    token: Tokens.StringToken;
}

export interface EjectStatement extends BaseNode {
    type: NodeType.Eject;
    token: Tokens.StringToken;
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
                w(`Invoke(${formatSingle(node.name)}, [${args}], program=`, indent);
                dumpNode(node.program, write, indent + 1);
                w(")", indent);
                break;
            default:
                w(formatSingle(node), indent + 1);
        }
    }
    w(")", indent);
}

// eslint-disable-next-line max-lines-per-function
export function formatSingle(node: Node): string {
    let str;
    switch (node.type) {
        case NodeType.Origin:
            return `Origin(${formatSingle(node.val)})`;
        case NodeType.Label:
            return `Label(${formatSingle(node.sym)})`;
        case NodeType.Assignment:
            return `Assign(${formatSingle(node.sym)}, ${formatSingle(node.val)})`;
        case NodeType.Separator:
            return `Separator('${replaceBlanks(node.separator)}')`;
        case NodeType.ExpressionStmt:
            return `ExprStmt(${formatSingle(node.expr)})`;
        case NodeType.Text:
            return `Text(delim='${node.delim}', "${node.token.str}")`;
        case NodeType.Comment:
            return `Comment("${node.token.comment}")`;
        case NodeType.SymbolGroup:
            str = "Group(";
            str += `${formatSingle(node.first)}, [`;
            str += node.exprs.map(n => formatSingle(n)).join(", ");
            str += "])";
            return str;
        case NodeType.ParenExpr:
            return `Paren('${node.paren}', ${formatSingle(node.expr)})`;
        case NodeType.Define:
            const params = node.params.map(a => formatSingle(a)).join(", ");
            return `Define(${formatSingle(node.name)}, [${params}], ${formatSingle(node.body)})`;
        case NodeType.BinaryOp:
            return `BinOp(${formatSingle(node.lhs)}, '${node.operator}', ${formatSingle(node.rhs)})`;
        case NodeType.UnaryOp:
            return `Unary(${node.operator}, ${formatSingle(node.elem)})`;
        case NodeType.Integer:
            return `Integer(${node.token.value})`;
        case NodeType.ASCIIChar:
            return `ASCII('${node.token.char}')`;
        case NodeType.Symbol:
            return `Symbol("${node.token.symbol}")`;
        case NodeType.DoubleIntList:
            return `Dubl([${node.list.map(x => Tokens.tokenToString(x.token))}])`;
        case NodeType.FloatList:
            return `Fltg([${node.list.map(x => Tokens.tokenToString(x.token))}}])`;
        case NodeType.CLCValue:
            return "CLC()";
        case NodeType.MacroBody:
            return `MacroBody("${replaceBlanks(Tokens.tokenToString(node.token))}")`;
        case NodeType.Eject:
            return `Eject("${node.token.str}")`;
        case NodeType.FixMri:
            return `FixMri("${formatSingle(node.assignment)}")`;
        case NodeType.Invocation:
        case NodeType.Program:
            throw Error("Logic error");
    }
}
