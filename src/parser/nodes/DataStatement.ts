import { StatementSeparator, Comment } from "./Statement.js";
import { UnaryOp } from "./Element.js";
import { Expression } from "./Expression.js";
import { BaseNode, NodeType } from "./Node.js";
import { FloatToken, IntegerToken, StringToken, SymbolToken } from "../../lexer/Token.js";

export type DataStatement =
    TextStatement | FilenameStatement | DevNameStatement |
    ZBlockStatement | DoubleIntList | FloatList;

// TEXT x...x
export interface TextStatement extends BaseNode {
    type: NodeType.Text;
    text: string;

    strToken: StringToken;
    token: SymbolToken; // on TEXT
}

// ZBLOCK
export interface ZBlockStatement extends BaseNode {
    type: NodeType.ZeroBlock;
    expr: Expression;
    token: SymbolToken; // on ZBLOCK
}

// FILENAME
export interface FilenameStatement extends BaseNode {
    type: NodeType.FileName;
    name: string;

    strTok: StringToken;
    token: SymbolToken; // on FILENAME
}

// DEVICE
export interface DevNameStatement extends BaseNode {
    type: NodeType.DeviceName;
    name: string;
    nameTok: SymbolToken;
    token: SymbolToken; // on DEVICE
}

// DUBL
export type DublListMember = (DoubleInt | StatementSeparator | Comment);
export interface DoubleIntList extends BaseNode {
    type: NodeType.DoubleIntList;
    list: DublListMember[];
    token: SymbolToken; // on DUBL
}

export interface DoubleInt extends BaseNode {
    type: NodeType.DoubleInt;
    unaryOp?: UnaryOp;
    value: string; // not including unary
    token: IntegerToken;
}

// FLTG
export type FloatListMember = (Float | StatementSeparator | Comment);
export interface FloatList extends BaseNode {
    type: NodeType.FloatList;
    list: FloatListMember[];
    token: SymbolToken; // on FLTG
}

export interface Float extends BaseNode {
    type: NodeType.Float;
    unaryOp?: UnaryOp;
    value: string; // not including unary
    token: FloatToken;
}
