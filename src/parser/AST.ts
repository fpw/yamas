/**
 *
 * Program: Statement | Statement Program
 *
 * Statement: OriginStatement | LabelDef | AssignStatement | ExpressionStatement | Comment | Text | StatementSeparator
 * OriginStatement: *Expression
 * LabelDef: Symbol,
 * AssignStatement: Symbol=Expression
 * ExpressionStatement: Expression
 * Comment: /.*
 * Text: TEXT ...
 * StatementSeparator: ;|\n|EOF
 *
 * Expression: SymbolGroup | ParenExpr | BinaryOp | UnparsedSequence | Element (but not symbol -> will be SymbolGroup with empty exprs instead)
 * SymbolGroup: Symbol [Expression]
 * ParenExpr: (Expression)? | [Expression]?
 * BinaryOp: Element Op Expression
 * UnparsedSequence: <.*>
 *
 * Element: UnaryOp | Integer | Symbol | ASCII | .
 * UnaryOp: -Element
 * Integer: [0-9]+
 * Symbol: [A-Z][A-Z0-9]+
 * ASCII: ".
 *
 */

export type BinaryOpChr =  "+" | "-" | "!" | "&" | "^" | "%";
export type UnaryOpChr = "-";

export interface Program {
    type: "program";
    stmts: Statement[];
}

export type Statement = OriginStatement | LabelDef | AssignStatement | StatementSeparator | ExpressionStatement | TextStatement | Comment;
export type Expression = SymbolGroup | ParenExpr | BinaryOp | UnparsedSequence | AstElement;

// *200
export interface OriginStatement {
    type: "origin";
    val: Expression;
}

// BEGIN, ...
export interface LabelDef {
    type: "label";
    sym: AstSymbol;
}

// A=B
export interface AssignStatement {
    type: "param";
    sym: AstSymbol;
    val: Expression;
}

// ;
export interface StatementSeparator {
    type: "separator";
    separator: ";" | "\n";
}

// TEXT x...x
export interface TextStatement {
    type: "text";
    delim: string;
    text: string;
}

// /Comment
export interface Comment {
    type: "comment";
    comment: string;
}

// Symbol<blank>[Expression]
export interface SymbolGroup {
    type: "group";
    first: AstSymbol;
    exprs: Expression[];
};

export interface ExpressionStatement {
    type: "exprStmt";
    expr: Expression;
}

export interface ParenExpr {
    type: "paren";
    paren: "(" | "[";
    expr: Expression;
}

// A + B
export interface BinaryOp {
    type: "binop";
    lhs: AstElement;
    operator: BinaryOpChr;
    rhs: Expression;
}

export type AstElement = UnaryOp | Integer | ASCIIChar | AstSymbol | CLCValue;

// -2
export interface UnaryOp {
    type: "unary";
    operator: UnaryOpChr;
    next: AstElement;
}

// < ... >
export interface UnparsedSequence {
    type: "unparsed";
    body: string;
}

export interface Integer {
    // unparsed because interpretation depends on environment (i.e. DECIMAL or OCTAL)
    type: "integer";
    int: string;
}

export interface ASCIIChar {
    type: "ascii";
    char: string;
}

export interface AstSymbol {
    type: "symbol";
    sym: string;
}

// .
export interface CLCValue {
    type: "clc";
}
