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

import { LexerError } from "./LexerError.js";
import { replaceNonPrints } from "../utils/Strings.js";
import { Cursor, CursorExtent } from "./Cursor.js";
import * as Tokens from "./Token.js";
import { TokenType } from "./Token.js";

export class Lexer {
    private static SymbolRegex = /([A-Z][A-Z0-9]*)/i;
    private static IntRegex = /([0-9]*)/;
    private static CommentRegEx = /\/([^\r\n]*)/;
    private static FloatRegex = /^(\d+\.\d*|\d*\.\d+|\d+)(e[-+]?\d+)?/i; // ddd.dddE+-ddd, unary +/- handled outside
    private inputName: string;
    private inputData: string;
    private cursor: Cursor;
    private savedCursor?: Cursor;
    private scanTable: Record<number, (data: string) => Tokens.Token> = [];
    private substitutions = new Map<string, string>();

    // set if we are inside a text substitution, i.e. a macro argument appearing inside the body
    // will be set to the actual text of the substitution to avoid repeated lookups
    private activeSubst?: string;

    private ungetCache?: Tokens.Token;
    private ungetCursor?: Cursor;

    public constructor(inputName: string, input: string) {
        this.inputName = inputName;
        this.inputData = input;

        this.cursor = {
            inputName: inputName,
            dataIdx: 0,
            colIdx: 0,
            lineIdx: 0,
        };

        this.fillScanTable();
    }

    public addSubstitution(symbol: string, sub: string) {
        this.substitutions.set(symbol, sub);
    }

    public getInputName(): string {
        return this.inputName;
    }

    public getCursor(): Cursor {
        return this.cursor;
    }

    public next(): Tokens.Token {
        if (this.ungetCache?.extent.cursor.dataIdx == this.cursor.dataIdx) {
            const res = this.ungetCache;
            this.ungetCache = undefined;
            this.cursor = this.ungetCursor!;
            return res;
        }

        const data = this.getData();
        if (this.cursor.dataIdx >= data.length) {
            return {
                type: TokenType.EOF,
                extent: {
                    cursor: this.cursor,
                    width: 0,
                }
            };
        }
        return this.scanFromData(data);
    }

    public ignoreCurrentLine() {
        const data = this.getData();
        this.skipToLineBreak(data);
    }

    public nextNonBlank(skipLineBreaks: boolean, gotTok?: Tokens.Token): Tokens.Token {
        if (gotTok && gotTok.type != TokenType.Blank && (gotTok.type != TokenType.EOL || !skipLineBreaks)) {
            return gotTok;
        }

        while (true) {
            const next = this.next();
            if (next.type == TokenType.EOL && skipLineBreaks) {
                continue;
            } else if (next.type != TokenType.Blank) {
                return next;
            }
        }
    }

    public nextStringLiteral(delim: boolean): Tokens.StringToken {
        const startCursor = this.cursor;
        const data = this.getData();
        const delims: string[] = [];

        this.skipBlank(data);

        if (delim) {
            delims[0] = data[this.cursor.dataIdx];
            this.advanceCursor(1);
        }

        let str = "";
        for (let i = this.cursor.dataIdx; i < data.length; i++) {
            this.advanceCursor(1);
            if (data[i] === delims[0]) {
                delims[1] = data[i];
                break;
            } else if ((!delim && (data[i] == "/" || data[i] == ";")) || this.isLineBreak(data[i])) {
                str = str.trim();
                this.cursor.dataIdx--;
                break;
            }
            str += data[i];
        }

        return {
            type: TokenType.String,
            str: str,
            delims: delims,
            extent: this.calcExtentFrom(startCursor),
        };
    }

    public nextFloat(): Tokens.FloatToken {
        const startCursor = this.cursor;
        const data = this.getData();
        const match = data.substring(this.cursor.dataIdx).match(Lexer.FloatRegex);
        if (!match) {
            throw new LexerError("Invalid float format", startCursor);
        }

        this.advanceCursor(match[0].length);

        return {
            type: TokenType.Float,
            value: match[0],
            extent: this.calcExtentFrom(startCursor),
        };
    }

    public nextMacroArgument(): Tokens.MacroBodyToken {
        const startCursor = this.cursor;
        const data = this.getData();

        let rawArg = "";
        let hadComma = false;
        for (let i = this.cursor.dataIdx; i < data.length; i++) {
            if (data[i] == "," || data[i] == ";" || data[i] == "/" || this.isLineBreak(data[i])) {
                if (data[i] == ",") {
                    hadComma = true;
                }
                break;
            }
            rawArg += data[i];
        }

        const arg = rawArg.trim();
        if (arg.length == 0) {
            throw new LexerError("Expected macro argument", startCursor);
        }

        this.advanceCursor(rawArg.length);
        if (hadComma) {
            this.advanceCursor(1);
        }

        return {
            type: TokenType.MacroBody,
            body: arg,
            extent: this.calcExtentFrom(startCursor),
        };
    }

    public unget(tok: Tokens.Token) {
        if (this.cursor.inputName != tok.extent.cursor.inputName) {
            throw new LexerError("Can't unget across substitution boundaries", this.cursor);
        }

        this.ungetCache = tok;
        this.ungetCursor = { ...this.cursor };
        this.cursor = tok.extent.cursor;
    }

    private getData(): string {
        // are we inside a text substitution?
        if (this.activeSubst) {
            if (this.cursor.dataIdx < this.activeSubst.length) {
                return this.activeSubst;
            } else {
                this.cursor = this.savedCursor!;
                this.activeSubst = undefined;
                this.savedCursor = undefined;
            }
        }
        return this.inputData;
    }

    private skipBlank(data: string) {
        while (this.isBlank(data[this.cursor.dataIdx])) {
            this.advanceCursor(1);
        }
    }

    private fillScanTable() {
        for (let c = 0; c < 256; c++) {
            const chr = String.fromCharCode(c);
            if (this.isLineBreak(chr)) {
                this.scanTable[c] = () => this.toNewLine(chr);
            } else if (this.isBlank(chr)) {
                this.scanTable[c] = () => this.toBlank(chr);
            } else if ((chr >= "A" && chr <= "Z") || (chr >= "a" && chr <= "z")) {
                this.scanTable[c] = this.scanAndCheckSymbol.bind(this);
            } else if (chr >= "0" && chr <= "9") {
                this.scanTable[c] = this.scanInt.bind(this);
            } else if (chr == "/") {
                this.scanTable[c] = this.scanComment.bind(this);
            } else if (chr == "<") {
                this.scanTable[c] = this.scanMacroBody.bind(this);
            } else if (chr == '"') {
                this.scanTable[c] = this.scanASCII.bind(this);
            }
        }
    }

    private scanFromData(data: string): Tokens.Token {
        const first = data[this.cursor.dataIdx];
        const handler = this.scanTable[first.charCodeAt(0)];

        if (handler) {
            return handler(data);
        } else {
            return this.scanChar(data);
        }
    }

    private scanAndCheckSymbol(data: string) {
        const sym = this.scanSymbol(data);
        if (this.substitutions.has(sym.name)) {
            this.activateSubstitution(sym.name);
            return this.next();
        } else {
            return sym;
        }
    }

    private activateSubstitution(symbol: string) {
        const subst = this.substitutions.get(symbol);
        if (!subst || this.savedCursor || this.activeSubst) {
            throw new LexerError("Logic error in substitution", this.cursor);
        }

        this.savedCursor = this.cursor;
        this.activeSubst = subst;
        this.cursor = {
            inputName: `${this.inputName}:APPLY_${symbol}`,
            dataIdx: 0,
            lineIdx: 0,
            colIdx: 0,
        };
    }

    private toNewLine(first: Tokens.LineBreakChr): Tokens.EOLToken {
        const startCursor = this.cursor;
        this.advanceCursor(1);
        return {
            type: TokenType.EOL,
            char: first,
            extent: this.calcExtentFrom(startCursor),
        };
    }

    private toBlank(first: Tokens.BlankChr): Tokens.BlankToken {
        const startCursor = this.cursor;
        this.advanceCursor(1);
        return {
            type: TokenType.Blank,
            char: first,
            extent: this.calcExtentFrom(startCursor),
        };
    }

    private scanSymbol(data: string): Tokens.SymbolToken {
        const startCursor = this.cursor;
        const match = data.substring(startCursor.dataIdx).match(Lexer.SymbolRegex);
        if (!match) {
            throw new LexerError("Expected symbol", startCursor);
        }
        const symbol = match[1];
        this.advanceCursor(symbol.length, true);

        return {
            type: TokenType.Symbol,
            name: symbol,
            extent: this.calcExtentFrom(startCursor),
        };
    }

    private scanInt(data: string): Tokens.IntegerToken {
        const startCursor = this.cursor;
        const match = data.substring(startCursor.dataIdx).match(Lexer.IntRegex);
        if (!match) {
            throw new LexerError("Expected integer", startCursor);
        }
        const int = match[1];
        this.advanceCursor(int.length, true);
        return {
            type: TokenType.Integer,
            value: int,
            extent: this.calcExtentFrom(startCursor),
        };
    }

    private scanComment(data: string): Tokens.CommentToken {
        const startCursor = this.cursor;
        const match = data.substring(startCursor.dataIdx).match(Lexer.CommentRegEx);
        if (!match) {
            throw new LexerError("Expected comment", startCursor);
        }
        const comment = match[1];
        this.advanceCursor(match[0].length, true);

        return {
            type: TokenType.Comment,
            comment: comment,
            extent: this.calcExtentFrom(startCursor),
        };
    }

    private scanMacroBody(data: string): Tokens.MacroBodyToken {
        const startCursor = this.cursor;
        this.advanceCursor(1); // skip first '<'
        let body = "";
        let level = 1;
        let inComment = false;
        while (this.cursor.dataIdx < data.length) {
            const c = data[this.cursor.dataIdx];
            if (c == ">") {
                level--;
                if (level == 0) {
                    this.advanceCursor(1); // skip last '>'
                    // if the macro ends due to a ">" inside a comment, we still need to treat the comment as such
                    if (inComment) {
                        const str = this.nextStringLiteral(false);
                        body += str.str;
                    }
                    break;
                }
            } else if (c == "<") {
                level++;
            } else if (c == "/") {
                inComment = true;
            } else if (this.isLineBreak(c)) {
                inComment = false;
            }
            body += c;
            this.advanceCursor(1);
        }

        if (level != 0) {
            throw new LexerError("Unterminated macro body", startCursor);
        }
        return { type: TokenType.MacroBody, body, extent: this.calcExtentFrom(startCursor) };
    }

    private skipToLineBreak(data: string): string {
        let res = "";
        while (this.cursor.dataIdx < data.length) {
            res += data[this.cursor.dataIdx];
            if (this.isLineBreak(data[this.cursor.dataIdx])) {
                break;
            }
            this.advanceCursor(1);
        }
        return res;
    }

    private scanASCII(data: string): Tokens.ASCIIToken {
        const startCursor = this.cursor;
        this.advanceCursor(1);
        const chr = data[this.cursor.dataIdx];
        this.advanceCursor(1);
        return {
            type: TokenType.ASCII,
            char: chr,
            extent: this.calcExtentFrom(startCursor),
        };
    }

    private scanChar(data: string): Tokens.CharToken | Tokens.EOFToken | Tokens.SeparatorToken {
        const startCursor = this.cursor;
        const chr = data[startCursor.dataIdx];
        this.advanceCursor(1);
        if (this.isOperator(chr)) {
            return {
                type: TokenType.Char,
                char: chr,
                extent: this.calcExtentFrom(startCursor),
            };
        }

        // non-operator characters get their own token
        switch (chr) {
            case "$":
                return {
                    type: TokenType.EOF,
                    char: chr,
                    extent: this.calcExtentFrom(startCursor),
                };
            case ";":
                return {
                    type: TokenType.Separator,
                    char: chr,
                    extent: this.calcExtentFrom(startCursor),
                };
        }

        throw new LexerError(`Unexpected character '${replaceNonPrints(chr)}'`, startCursor);
    }

    private advanceCursor(step: number, noNewline?: boolean) {
        const data = this.getData();
        // make sure to create a new object so that the references in next() keep their state
        const newCursor = { ...this.cursor };

        if (noNewline) {
            newCursor.colIdx += step;
            newCursor.dataIdx += step;
        } else {
            for (let i = 0; i < step; i++) {
                if (data[newCursor.dataIdx] == "\n") {
                    newCursor.lineIdx++;
                    newCursor.colIdx = 0;
                } else {
                    newCursor.colIdx++;
                }
                newCursor.dataIdx++;
            }
        }

        this.cursor = newCursor;
    }

    private isOperator(chr: string): chr is Tokens.OperatorChr {
        return Tokens.OperatorChars.includes(chr);
    }

    private isLineBreak(chr: string): chr is Tokens.LineBreakChr {
        return chr == "\n";
    }

    private isBlank(chr: string): chr is Tokens.BlankChr {
        return chr == " " || chr == "\r" || chr == "\t" || chr == "\f";
    }

    private calcExtentFrom(start: Cursor): CursorExtent {
        const end = this.cursor;

        return {
            cursor: start,
            width: end.dataIdx - start.dataIdx,
        };
    }
}
