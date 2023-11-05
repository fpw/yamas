import { CharToken, CommentToken, EOLToken, MacroBodyToken, SeparatorToken } from "../../lexer/Token.js";
import { SymbolNode } from "./Element.js";
import { Expression } from "./Expression.js";
import { BaseNode, NodeType, Program } from "./Node.js";
import { PseudoStatement } from "./PseudoStatement.js";

export type Statement =
    PseudoStatement |
    OriginStatement | LabelDef | AssignStatement |
    ExpressionStatement | Invocation |
    Comment | StatementSeparator;

// *200
export interface OriginStatement extends BaseNode {
    type: NodeType.Origin;
    val: Expression;
    token: CharToken; // on *
}

// BEGIN, ...
export interface LabelDef {
    type: NodeType.Label;
    sym: SymbolNode;
    token: CharToken; // on ,
}

// A=B
export interface AssignStatement extends BaseNode {
    type: NodeType.Assignment;
    sym: SymbolNode;
    val: Expression;
    token: CharToken; // on =
}

// M A1, A2 where M is macro
export interface Invocation extends BaseNode {
    type: NodeType.Invocation;
    macro: SymbolNode;
    args: MacroBodyToken[];
    program: Program;
}

// ;
export interface StatementSeparator extends BaseNode {
    type: NodeType.Separator;
    separator: ";" | "\n";
    token: EOLToken | SeparatorToken;
}

// /Comment
export interface Comment extends BaseNode {
    type: NodeType.Comment;
    comment: string;
    token: CommentToken;
}

// an expression as a data-generating statement
export interface ExpressionStatement extends BaseNode {
    type: NodeType.ExpressionStmt;
    expr: Expression;
}
