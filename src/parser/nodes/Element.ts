import { ASCIIToken, CharToken, IntegerToken, SymbolToken, UnaryOpChr } from "../../lexer/Token.js";
import { BaseNode, NodeType } from "./Node.js";

export type ElementType = Integer | ASCIIChar | SymbolNode | CLCValue;

export interface Element {
    type: NodeType.Element;
    unaryOp?: UnaryOp;
    node: ElementType;
}

// -2
export interface UnaryOp extends BaseNode {
    type: NodeType.UnaryOp;
    operator: UnaryOpChr;
    token: CharToken; // on operator
}

export interface Integer extends BaseNode {
    // unparsed because interpretation depends on environment (i.e. DECIMAL or OCTAL)
    type: NodeType.Integer;
    value: string;
    token: IntegerToken;
}

export interface ASCIIChar extends BaseNode {
    type: NodeType.ASCIIChar;
    char: string;
    token: ASCIIToken;
}

export interface SymbolNode extends BaseNode {
    type: NodeType.Symbol;
    name: string;
    token: SymbolToken;
}

// .
export interface CLCValue extends BaseNode {
    type: NodeType.CLCValue;
    token: CharToken;
}
