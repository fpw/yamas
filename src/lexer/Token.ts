import { Cursor } from "./Lexer";

export type Token = BlankToken | EOLToken | SymbolToken | IntegerToken | CharToken | CommentToken | ASCIIToken | TextToken | RawSequenceToken | EOFToken;

export enum TokenType {
    Blank,
    Symbol,
    Integer,
    Char,
    ASCII,
    Text,
    Comment,
    RawSequence,
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
    char: " " | "\t" | "\f";
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
    char: string;
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

export interface RawSequenceToken extends BaseToken {
    type: TokenType.RawSequence;
    body: string;
}

export interface EOFToken extends BaseToken {
    type: TokenType.EOF;
}

export function tokenToString(tok: Token): string {
    switch (tok.type) {
        case TokenType.ASCII:       return `ASCII('${tok.char}')`;
        case TokenType.Blank:       return `Blank(${tok.char.replace(" ", "SPC").replace("\t", "TAB").replace("\f", "FF")})`;
        case TokenType.Char:        return `Char('${tok.char}')`;
        case TokenType.Comment:     return `Comment("${tok.comment}")`;
        case TokenType.EOF:         return "EOF()";
        case TokenType.EOL:         return `EOL(${tok.char.replace("\r", "CR").replace("\n", "LF").replace("\f", "FF")})`;
        case TokenType.Integer:     return `Integer(${tok.value})`;
        case TokenType.RawSequence: return `RawSequence(${tok.body})`;
        case TokenType.Symbol:      return `Symbol(${tok.symbol})`;
        case TokenType.Text:        return `Text("${tok.text}", '${tok.delim}')`;
    }
}
