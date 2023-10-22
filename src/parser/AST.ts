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

import { ASCIIToken, CharToken, CommentToken, EOLToken, IntegerToken, RawSequenceToken, SymbolToken, TextToken } from "../lexer/Token";

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

export type Statement = OriginStatement | LabelDef | AssignStatement | StatementSeparator | ExpressionStatement | TextStatement | Comment;
export type Expression = SymbolGroup | ParenExpr | BinaryOp | UnparsedSequence | AstElement;
export type AstElement = UnaryOp | Integer | ASCIIChar | AstSymbol | CLCValue;

export interface AstNode {
    type: AstNodeType;
}

export interface Program extends AstNode {
    type: AstNodeType.Program;
    stmts: Statement[];
}

// *200
export interface OriginStatement extends AstNode {
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
export interface AssignStatement extends AstNode {
    type: AstNodeType.Assignment;
    sym: AstSymbol;
    val: Expression;
    token: CharToken; // on =
}

// ;
export interface StatementSeparator extends AstNode {
    type: AstNodeType.Separator;
    separator: ";" | "\n";
    token: EOLToken | CharToken;
}

// TEXT x...x
export interface TextStatement extends AstNode {
    type: AstNodeType.Text;
    token: TextToken;
}

// /Comment
export interface Comment extends AstNode {
    type: AstNodeType.Comment;
    token: CommentToken;
}

// Symbol<blank>[Expression]
export interface SymbolGroup extends AstNode {
    type: AstNodeType.SymbolGroup;
    first: AstSymbol;
    exprs: Expression[];
};

export interface ExpressionStatement extends AstNode {
    type: AstNodeType.ExpressionStmt;
    expr: Expression;
}

export interface ParenExpr extends AstNode {
    type: AstNodeType.ParenExpr;
    paren: "(" | "[";
    expr: Expression;
    token: CharToken;
}

// A + B
export type BinaryOpChr =  "+" | "-" | "!" | "&" | "^" | "%";
export interface BinaryOp extends AstNode {
    type: AstNodeType.BinaryOp;
    lhs: BinaryOp | AstElement;
    operator: BinaryOpChr;
    rhs: AstElement;
    token: CharToken; // on op
}

// -2
export type UnaryOpChr = "-";
export interface UnaryOp extends AstNode {
    type: AstNodeType.UnaryOp;
    operator: UnaryOpChr;
    next: AstElement;
    token: CharToken;
}

// < ... >
export interface UnparsedSequence extends AstNode {
    type: AstNodeType.UnparsedSequence;
    parsed?: Program;
    token: RawSequenceToken;
}

export interface Integer extends AstNode {
    // unparsed because interpretation depends on environment (i.e. DECIMAL or OCTAL)
    type: AstNodeType.Integer;
    token: IntegerToken;
}

export interface ASCIIChar extends AstNode {
    type: AstNodeType.ASCIIChar;
    token: ASCIIToken;
}

export interface AstSymbol extends AstNode {
    type: AstNodeType.Symbol;
    token: SymbolToken;
}

// .
export interface CLCValue extends AstNode {
    type: AstNodeType.CLCValue;
    token: CharToken;
}
