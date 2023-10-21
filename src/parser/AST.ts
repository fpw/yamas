export type BinaryOpChr =  "+" | "-" | "!" | "&" | "^" | "%" | " ";
export type UnaryOpChr = "-";

export interface Program {
    type: "program";
    stmts: Statement[];
}

export type Statement = OriginStatement | LabelDef | AssignStatement | StatementSeparator | ExpressionStatement | Comment;
export type Expression = ParenExpr | BinaryOp | UnparsedSequence | AstElement;

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

// /Comment
export interface Comment {
    type: "comment";
    comment: string;
}

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

export type AstElement = UnaryOp | Integer | AstSymbol | CLCValue;

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

export interface AstSymbol {
    type: "symbol";
    sym: string;
}

// .
export interface CLCValue {
    type: "clc";
}
