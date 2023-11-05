import { BaseNode, NodeType } from "./Node.js";
import { BinaryOpChr, CharToken } from "../../lexer/Token.js";
import { Element } from "./Element.js";

export type Expression =
    SymbolGroup | ParenExpr | BinaryOp | Element;

// Symbol<blank>[Expression]
export interface SymbolGroup extends BaseNode {
    type: NodeType.SymbolGroup;
    first: Element;
    exprs: Expression[];
};

// (9), [TAD]
export interface ParenExpr extends BaseNode {
    type: NodeType.ParenExpr;
    paren: "(" | "[";
    expr: Expression;
    token: CharToken;
}

// A+B!C...
export interface BinaryOp extends BaseNode {
    type: NodeType.BinaryOp;
    lhs: BinaryOp | Element;
    operator: BinaryOpChr;
    rhs: Element;
    token: CharToken; // on op
}
