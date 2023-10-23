import { replaceControlChars } from "../common";
import { Cursor } from "./Lexer";

export type OperatorChr = BinaryOpChr | UnaryOpChr | ParenChr | "." | "," | "=" | "*";
export type ParenChr =  "(" | ")" | "[" | "]";
export type BinaryOpChr =  "+" | "-" | "!" | "&" | "^" | "%";
export type UnaryOpChr = "-";

export const OperatorChars = [
    ".", ",", "=", "*",
    "(", ")", "[", "]",
    "+", "-", "!", "&", "^", "%",
    "-",
];

export type Token =
    BlankToken | EOLToken | EOFToken | SeparatorToken |
    SymbolToken | IntegerToken | CharToken |
    CommentToken | ASCIIToken | TextToken | MacroBodyToken;

export enum TokenType {
    Blank,
    Symbol,
    Integer,
    Char,
    ASCII,
    Text,
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

export interface CharToken extends BaseToken {
    type: TokenType.Char;
    char: OperatorChr;
}

export interface ASCIIToken extends BaseToken {
    type: TokenType.ASCII;
    char: string;
}

export interface TextToken extends BaseToken {
    type: TokenType.Text;
    text: string;
    delim: string;
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
        case TokenType.Blank:       return `Blank('${replaceControlChars(tok.char)}')`;
        case TokenType.Char:        return `Char('${replaceControlChars(tok.char)}')`;
        case TokenType.ASCII:       return `ASCII('${replaceControlChars(tok.char)}')`;
        case TokenType.Comment:     return `Comment("${tok.comment}")`;
        case TokenType.Integer:     return `Integer(${tok.value})`;
        case TokenType.MacroBody:   return `MacroBody(${replaceControlChars(tok.body)})`;
        case TokenType.Symbol:      return `Symbol(${tok.symbol})`;
        case TokenType.Text:        return `Text("${tok.text}", '${tok.delim}')`;
        case TokenType.Separator:   return `Separator('${replaceControlChars(tok.char)})`;
        case TokenType.EOL:         return `EOL('${replaceControlChars(tok.char)}')`;
        case TokenType.EOF:         return "EOF()";
    }
}
