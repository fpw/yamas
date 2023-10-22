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
 * Expression: SymbolGroup | ParenExpr | BinaryOp | UnparsedSequence | Element (but not symbol -> will be SymbolGroup)
 *  SymbolGroup: Symbol [Expression]
 *  ParenExpr: (Expression)? | [Expression]?
 *  BinaryOp: BinaryOp | AstElement Op AstElement
 *  UnparsedSequence: <.*>
 *
 * Element: UnaryOp | Integer | Symbol | ASCII | .
 *  UnaryOp: -Element
 *  Integer: [0-9]+
 *  Symbol: [A-Z][A-Z0-9]+
 *  ASCII: ".
 *
 */

import {
    ASCIIToken, CharToken, CommentToken, EOLToken, IntegerToken,
    RawSequenceToken, SymbolToken, TextToken, tokenToString
} from "../lexer/Token";

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
    Comment,

    // Expression
    SymbolGroup,
    ParenExpr,
    BinaryOp,
    UnparsedSequence,

    // Element
    UnaryOp,
    Integer,
    ASCIIChar,
    Symbol,
    CLCValue,
}

export type AstNode = Program | Statement | Expression | AstElement;

export type Statement =
    OriginStatement |
    ExpressionStatement | LabelDef | AssignStatement |
    DefineStatement | Invocation |
    TextStatement | Comment | StatementSeparator;

export type Expression =
    SymbolGroup | ParenExpr | BinaryOp |
    UnparsedSequence | AstElement;

export type AstElement = UnaryOp | Integer | ASCIIChar | AstSymbol | CLCValue;

export interface BaseAstNode {
    type: NodeType;
}

export interface Program extends BaseAstNode {
    type: NodeType.Program;
    stmts: Statement[];
}

// *200
export interface OriginStatement extends BaseAstNode {
    type: NodeType.Origin;
    val: Expression;
    token: CharToken; // on *
}

// BEGIN, ...
export interface LabelDef {
    type: NodeType.Label;
    sym: AstSymbol;
    token: CharToken; // on ,
}

// A=B
export interface AssignStatement extends BaseAstNode {
    type: NodeType.Assignment;
    sym: AstSymbol;
    val: Expression;
    token: CharToken; // on =
}

export interface DefineStatement extends BaseAstNode {
    type: NodeType.Define;
    name: AstSymbol;
    params: AstSymbol[];
    body: UnparsedSequence;
    token: SymbolToken; // on DEFINE
}

export interface Invocation extends BaseAstNode {
    type: NodeType.Invocation;
    name: AstSymbol;
    args: RawSequenceToken[];
    program: Program;
}

// ;
export interface StatementSeparator extends BaseAstNode {
    type: NodeType.Separator;
    separator: ";" | "\n";
    token: EOLToken | CharToken;
}

// TEXT x...x
export interface TextStatement extends BaseAstNode {
    type: NodeType.Text;
    token: TextToken;
}

// /Comment
export interface Comment extends BaseAstNode {
    type: NodeType.Comment;
    token: CommentToken;
}

// Symbol<blank>[Expression]
export interface SymbolGroup extends BaseAstNode {
    type: NodeType.SymbolGroup;
    first: AstSymbol;
    exprs: Expression[];
};

export interface ExpressionStatement extends BaseAstNode {
    type: NodeType.ExpressionStmt;
    expr: Expression;
}

export interface ParenExpr extends BaseAstNode {
    type: NodeType.ParenExpr;
    paren: "(" | "[";
    expr: Expression;
    token: CharToken;
}

// A + B
export type BinaryOpChr =  "+" | "-" | "!" | "&" | "^" | "%";
export interface BinaryOp extends BaseAstNode {
    type: NodeType.BinaryOp;
    lhs: BinaryOp | AstElement;
    operator: BinaryOpChr;
    rhs: AstElement;
    token: CharToken; // on op
}

// -2
export type UnaryOpChr = "-";
export interface UnaryOp extends BaseAstNode {
    type: NodeType.UnaryOp;
    operator: UnaryOpChr;
    next: AstElement;
    token: CharToken;
}

// < ... >
export interface UnparsedSequence extends BaseAstNode {
    type: NodeType.UnparsedSequence;
    parsed?: Program;
    token: RawSequenceToken;
}

export interface Integer extends BaseAstNode {
    // unparsed because interpretation depends on environment (i.e. DECIMAL or OCTAL)
    type: NodeType.Integer;
    token: IntegerToken;
}

export interface ASCIIChar extends BaseAstNode {
    type: NodeType.ASCIIChar;
    token: ASCIIToken;
}

export interface AstSymbol extends BaseAstNode {
    type: NodeType.Symbol;
    token: SymbolToken;
}

// .
export interface CLCValue extends BaseAstNode {
    type: NodeType.CLCValue;
    token: CharToken;
}

export function formatASTNode(node: AstNode): string {
    let str = "";
    switch (node.type) {
        case NodeType.Program:
            str = "Program(\n";
            for (const stmt of node.stmts) {
                str += "  Statement(" + formatASTNode(stmt) + ")\n";
            }
            str += ")";
            return str;
        case NodeType.Origin:
            return `Origin(${formatASTNode(node.val)}, tok=${tokenToString(node.token)})`;
        case NodeType.Label:
            return `Label(${formatASTNode(node.sym)}, tok=${tokenToString(node.token)})`;
        case NodeType.Assignment:
            return `Assign(${formatASTNode(node.sym)}, ${formatASTNode(node.val)}, tok=${tokenToString(node.token)})`;
        case NodeType.Separator:
            return `Separator(${node.separator.replace("\n", "LF")}, tok=${tokenToString(node.token)})`;
        case NodeType.ExpressionStmt:
            return `ExprStmt(${formatASTNode(node.expr)})`;
        case NodeType.Text:
            return `Text(tok=${tokenToString(node.token)})`;
        case NodeType.Comment:
            return `Comment(tok=${tokenToString(node.token)})`;
        case NodeType.SymbolGroup:
            str = "Group(";
            str += `${formatASTNode(node.first)}, [`;
            str += node.exprs.map(n => formatASTNode(n)).join(", ");
            str += "])";
            return str;
        case NodeType.ParenExpr:
            return `Paren('${node.paren}', ${formatASTNode(node.expr)}, tok=${tokenToString(node.token)})`;
        case NodeType.Define:
            const params = node.params.map(a => formatASTNode(a)).join(", ");
            return `Define(${formatASTNode(node.name)}, [${params}], ${formatASTNode(node.body)})`;
        case NodeType.Invocation:
            const args = node.args.map(a => tokenToString(a)).join(", ");
            return `Invoke(${formatASTNode(node.name)}, [${args}], program=${formatASTNode(node.program)})`;
        case NodeType.BinaryOp:
            return `BinOp(${formatASTNode(node.lhs)}, ${node.operator}, ${formatASTNode(node.rhs)})`;
        case NodeType.UnparsedSequence:
            return `Unparsed(tok=${tokenToString(node.token)})`;
        case NodeType.UnaryOp:
            return `Unary(${node.operator}, ${formatASTNode(node.next)}, tok=${tokenToString(node.token)})`;
        case NodeType.Integer:
            return `Integer(tok=${tokenToString(node.token)})`;
        case NodeType.ASCIIChar:
            return `ASCII(tok=${tokenToString(node.token)})`;
        case NodeType.Symbol:
            return `Symbol(tok=${tokenToString(node.token)})`;
        case NodeType.CLCValue:
            return `CLC(tok=${tokenToString(node.token)})`;
    }
}
