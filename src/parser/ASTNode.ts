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
 * Expression: SymbolGroup | ParenExpr | BinaryOp | UnparsedSequence | Element (but not symbol -> will be SymbolGroup with empty exprs instead)
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

import { ASCIIToken, CharToken, CommentToken, EOLToken, IntegerToken, RawSequenceToken, SymbolToken, TextToken, tokenToString } from "../lexer/Token";

export enum AstNodeType {
    // Program
    Program,

    // Statement
    Origin,
    Label,
    Assignment,
    Separator,
    ExpressionStmt,
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
export type Statement = OriginStatement | LabelDef | AssignStatement | StatementSeparator | ExpressionStatement | TextStatement | Comment;
export type Expression = SymbolGroup | ParenExpr | BinaryOp | UnparsedSequence | AstElement;
export type AstElement = UnaryOp | Integer | ASCIIChar | AstSymbol | CLCValue;

export interface BaseAstNode {
    type: AstNodeType;
}

export interface Program extends BaseAstNode {
    type: AstNodeType.Program;
    stmts: Statement[];
}

// *200
export interface OriginStatement extends BaseAstNode {
    type: AstNodeType.Origin;
    val: Expression;
    token: CharToken; // on *
}

// BEGIN, ...
export interface LabelDef {
    type: AstNodeType.Label;
    sym: AstSymbol;
    token: CharToken; // on ,
}

// A=B
export interface AssignStatement extends BaseAstNode {
    type: AstNodeType.Assignment;
    sym: AstSymbol;
    val: Expression;
    token: CharToken; // on =
}

// ;
export interface StatementSeparator extends BaseAstNode {
    type: AstNodeType.Separator;
    separator: ";" | "\n";
    token: EOLToken | CharToken;
}

// TEXT x...x
export interface TextStatement extends BaseAstNode {
    type: AstNodeType.Text;
    token: TextToken;
}

// /Comment
export interface Comment extends BaseAstNode {
    type: AstNodeType.Comment;
    token: CommentToken;
}

// Symbol<blank>[Expression]
export interface SymbolGroup extends BaseAstNode {
    type: AstNodeType.SymbolGroup;
    first: AstSymbol;
    exprs: Expression[];
};

export interface ExpressionStatement extends BaseAstNode {
    type: AstNodeType.ExpressionStmt;
    expr: Expression;
}

export interface ParenExpr extends BaseAstNode {
    type: AstNodeType.ParenExpr;
    paren: "(" | "[";
    expr: Expression;
    token: CharToken;
}

// A + B
export type BinaryOpChr =  "+" | "-" | "!" | "&" | "^" | "%";
export interface BinaryOp extends BaseAstNode {
    type: AstNodeType.BinaryOp;
    lhs: BinaryOp | AstElement;
    operator: BinaryOpChr;
    rhs: AstElement;
    token: CharToken; // on op
}

// -2
export type UnaryOpChr = "-";
export interface UnaryOp extends BaseAstNode {
    type: AstNodeType.UnaryOp;
    operator: UnaryOpChr;
    next: AstElement;
    token: CharToken;
}

// < ... >
export interface UnparsedSequence extends BaseAstNode {
    type: AstNodeType.UnparsedSequence;
    parsed?: Program;
    token: RawSequenceToken;
}

export interface Integer extends BaseAstNode {
    // unparsed because interpretation depends on environment (i.e. DECIMAL or OCTAL)
    type: AstNodeType.Integer;
    token: IntegerToken;
}

export interface ASCIIChar extends BaseAstNode {
    type: AstNodeType.ASCIIChar;
    token: ASCIIToken;
}

export interface AstSymbol extends BaseAstNode {
    type: AstNodeType.Symbol;
    token: SymbolToken;
}

// .
export interface CLCValue extends BaseAstNode {
    type: AstNodeType.CLCValue;
    token: CharToken;
}

export function formatASTNode(node: AstNode): string {
    let str = "";
    switch (node.type) {
        case AstNodeType.Program:
            str = "Program(\n";
            for (const stmt of node.stmts) {
                str += "  Statement(" + formatASTNode(stmt) + ")\n";
            }
            str += ")";
            return str;
        case AstNodeType.Origin:
            return `Origin(${formatASTNode(node.val)}, tok=${tokenToString(node.token)})`;
        case AstNodeType.Label:
            return `Label(${formatASTNode(node.sym)}, tok=${tokenToString(node.token)})`;
        case AstNodeType.Assignment:
            return `Assign(${formatASTNode(node.sym)}, ${formatASTNode(node.val)}, tok=${tokenToString(node.token)})`;
        case AstNodeType.Separator:
            return `Separator(${node.separator.replace("\n", "LF")}, tok=${tokenToString(node.token)})`;
        case AstNodeType.ExpressionStmt:
            return `ExprStmt(${formatASTNode(node.expr)})`;
        case AstNodeType.Text:
            return `Text(tok=${tokenToString(node.token)})`;
        case AstNodeType.Comment:
            return `Comment(tok=${tokenToString(node.token)})`;
        case AstNodeType.SymbolGroup:
            str = "Group(";
            str += `${formatASTNode(node.first)}, [`;
            str += node.exprs.map(n => formatASTNode(n)).join(", ");
            str += "])";
            return str;
        case AstNodeType.ParenExpr:
            return `Paren('${node.paren}', ${formatASTNode(node.expr)}, tok=${tokenToString(node.token)})`;
        case AstNodeType.BinaryOp:
            return `Binary(${formatASTNode(node.lhs)}, ${node.operator}, ${formatASTNode(node.rhs)} tok=${tokenToString(node.token)})`;
        case AstNodeType.UnparsedSequence:
            return `Unparsed(tok=${tokenToString(node.token)})`;
        case AstNodeType.UnaryOp:
            return `Unary(${node.operator}, ${formatASTNode(node.next)}, tok=${tokenToString(node.token)})`;
        case AstNodeType.Integer:
            return `Integer(tok=${tokenToString(node.token)})`;
        case AstNodeType.ASCIIChar:
            return `ASCII(tok=${tokenToString(node.token)})`;
        case AstNodeType.Symbol:
            return `Symbol(tok=${tokenToString(node.token)})`;
        case AstNodeType.CLCValue:
            return `CLC(tok=${tokenToString(node.token)})`;
    }
}
