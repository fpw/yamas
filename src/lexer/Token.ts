/*
 *   Yamas - Yet Another Macro Assembler (for the PDP-8)
 *   Copyright (C) 2023 Folke Will <folko@solhost.org>
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Affero General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU Affero General Public License for more details.
 *
 *   You should have received a copy of the GNU Affero General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { CursorExtent } from "./Cursor.js";

export type OperatorChr = BinaryOpChr | UnaryOpChr | ParenChr | "." | "," | "=" | "*";
export type ParenChr =  "(" | ")" | "[" | "]";
export type BinaryOpChr =  "+" | "-" | "!" | "&" | "^" | "%";
export type UnaryOpChr = "-" | "+";

export type LineBreakChr = "\r" | "\n";
export type BlankChr = " " | "\t" | "\f";

export const OperatorChars = [
    ".", ",", "=", "*",
    "(", ")", "[", "]",
    "+", "-", "!", "&", "^", "%",
];

export type Token =
    BlankToken | EOLToken | EOFToken | SeparatorToken |
    SymbolToken | IntegerToken | CharToken | FloatToken |
    CommentToken | ASCIIToken | StringToken | MacroBodyToken;

export const enum TokenType {
    Blank, EOL, EOF, Separator, Comment,
    Symbol, Integer, Float, Char, ASCII, String,
    MacroBody,
}

export interface BaseToken {
    type: TokenType;
    extent: CursorExtent;
}

export interface BlankToken extends BaseToken {
    type: TokenType.Blank;
    char: BlankChr;
}

export interface EOLToken extends BaseToken {
    type: TokenType.EOL;
    char: LineBreakChr;
}

export interface SymbolToken extends BaseToken {
    type: TokenType.Symbol;
    name: string;
}

export interface IntegerToken extends BaseToken {
    type: TokenType.Integer;
    value: string;
}

export interface FloatToken extends BaseToken {
    type: TokenType.Float;
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

export interface StringToken extends BaseToken {
    type: TokenType.String;
    str: string;
    delims: string[];
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
