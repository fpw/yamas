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
    fileIdx: number;
    line: number;
    startCol: number;
    endCol: number;
}

export interface BlankToken extends BaseToken {
    type: TokenType.Blank;
    char: string;
}

export interface EOLToken extends BaseToken {
    type: TokenType.EOL;
    char: string;
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
