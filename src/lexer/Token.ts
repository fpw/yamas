import { replaceBlanks } from "../utils/Strings";
import { Cursor } from "./Lexer";

export type OperatorChr = BinaryOpChr | UnaryOpChr | ParenChr | "." | "," | "=" | "*";
export type ParenChr =  "(" | ")" | "[" | "]";
export type BinaryOpChr =  "+" | "-" | "!" | "&" | "^" | "%";
export type UnaryOpChr = "-" | "+";

export const OperatorChars = [
    ".", ",", "=", "*",
    "(", ")", "[", "]",
    "+", "-", "!", "&", "^", "%",
];

export type Token =
    BlankToken | EOLToken | EOFToken | SeparatorToken |
    SymbolToken | IntegerToken | CharToken | FloatToken |
    CommentToken | ASCIIToken | StringToken | MacroBodyToken;

export enum TokenType {
    Blank,
    Symbol,
    Integer,
    Float,
    Char,
    ASCII,
    String,
    Separator,
    Comment,
    MacroBody,
    EOL,
    EOF,
}

export interface BaseToken {
    type: TokenType;
    cursor: Cursor;
    width: number;
}

export interface BlankToken extends BaseToken {
    type: TokenType.Blank;
    char: " " | "\t";
}

export interface EOLToken extends BaseToken {
    type: TokenType.EOL;
    char: "\r" | "\n" | "\f";
}

export interface SymbolToken extends BaseToken {
    type: TokenType.Symbol;
    symbol: string;
}

export interface IntegerToken extends BaseToken {
    type: TokenType.Integer;
    value: string;
}

export interface FloatToken extends BaseToken {
    type: TokenType.Float;
    float: number;
}

export interface CharToken extends BaseToken {
    type: TokenType.Char;
    char: OperatorChr;
}

export interface ASCIIToken extends BaseToken {
    type: TokenType.ASCII;
    char: string;
}

export interface StringToken extends BaseToken {
    type: TokenType.String;
    str: string;
}

export interface CommentToken extends BaseToken {
    type: TokenType.Comment;
    comment: string;
}

export interface MacroBodyToken extends BaseToken {
    type: TokenType.MacroBody;
    body: string;
}

export interface SeparatorToken extends BaseToken {
    type: TokenType.Separator;
    char: ";";
}

export interface EOFToken extends BaseToken {
    type: TokenType.EOF;
    char?: "$"; // if enforced
}

export function tokenToString(tok: Token): string {
    switch (tok.type) {
        case TokenType.Blank:       return `Blank('${replaceBlanks(tok.char)}')`;
        case TokenType.Char:        return `Char('${replaceBlanks(tok.char)}')`;
        case TokenType.ASCII:       return `ASCII('${replaceBlanks(tok.char)}')`;
        case TokenType.Comment:     return `Comment("${tok.comment}")`;
        case TokenType.Integer:     return `Integer(${tok.value})`;
        case TokenType.Float:       return `Float(${tok.float})`;
        case TokenType.MacroBody:   return `MacroBody(${replaceBlanks(tok.body)})`;
        case TokenType.Symbol:      return `Symbol(${tok.symbol})`;
        case TokenType.String:      return `String("${tok.str}")`;
        case TokenType.Separator:   return `Separator('${replaceBlanks(tok.char)})`;
        case TokenType.EOL:         return `EOL('${replaceBlanks(tok.char)}')`;
        case TokenType.EOF:         return "EOF()";
    }
}
