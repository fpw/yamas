import { BaseNode, NodeType, Program } from "./Node.js";
import { SymbolNode } from "./Element.js";
import { Expression } from "./Expression.js";
import { MacroBodyToken, SymbolToken } from "../../lexer/Token.js";

export type MacroStatement =
    DefineStatement |
    IfZeroStatement | IfNotZeroStatement |
    IfDefStatement | IfNotDefStatement;

// DEFINE M P1 P2 <body>
export interface DefineStatement extends BaseNode {
    type: NodeType.Define;
    name: SymbolNode;
    params: SymbolNode[];
    body: MacroBody;
    token: SymbolToken; // on DEFINE
}

// IFDEF
export interface IfDefStatement extends BaseNode {
    type: NodeType.IfDef;
    symbol: SymbolNode;
    body: MacroBody;
    token: SymbolToken;
}

// IFNDEF
export interface IfNotDefStatement extends BaseNode {
    type: NodeType.IfNotDef;
    symbol: SymbolNode;
    body: MacroBody;
    token: SymbolToken;
}

// IFZERO
export interface IfZeroStatement extends BaseNode {
    type: NodeType.IfZero;
    expr: Expression;
    body: MacroBody;
    token: SymbolToken;
}

// IFNZRO
export interface IfNotZeroStatement extends BaseNode {
    type: NodeType.IfNotZero;
    expr: Expression;
    body: MacroBody;
    token: SymbolToken;
}

// < ... >
export interface MacroBody extends BaseNode {
    type: NodeType.MacroBody;
    code: string;
    token: MacroBodyToken;
    parsed?: Program; // cache for assembler, TODO: move somewhere else
}
