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

import { replaceBlanks } from "../utils/Strings.js";
import { Cursor, mkCursorError } from "./Cursor.js";
import * as Tokens from "./Token.js";
import { TokenType } from "./Token.js";

export class Lexer {
    private static SymbolRegex = /([A-Z][A-Z0-9]*)/i;
    private static IntRegex = /([0-9]*)/;
    private static CommentRegEx = /\/([^\r\n]*)/;
    private static FloatRegex = /^[-+]?(\d+\.\d*|\d*\.\d+|\d+)([E][-+]?\d+)?/i; // +-ddd.dddE+-ddd
    private inputName: string;
    private inputData: string;
    private substitutions = new Map<string, string>();
    private cursor: Cursor;
    private savedCursor?: Cursor;
    private scanTable: { [id: number]: ((data: string) => Tokens.Token) } = [];

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
        if (this.ungetCache?.cursor.dataIdx == this.cursor.dataIdx) {
            const res = this.ungetCache;
            this.ungetCache = undefined;
            this.cursor = this.ungetCursor!;
            return res;
        }

        const data = this.getData();
        if (this.cursor.dataIdx >= data.length) {
            return {
                type: TokenType.EOF,
                cursor: this.cursor,
                width: 0,
            };
        }
        return this.scanFromData(data);
    }

    public ignoreCurrentLine() {
        const data = this.getData();
        this.skipToLineBreak(data);
    }

    public nextNonBlank(gotTok?: Tokens.Token, skipLinebreaks = false): Tokens.Token {
        while (true) {
            const next = gotTok ?? this.next();
            gotTok = undefined;
            if (next.type == TokenType.EOL && skipLinebreaks) {
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
            ...this.getTokenMeasurement(startCursor),
        };
    }

    public nextFloat(): Tokens.FloatToken {
        const startCursor = this.cursor;
        const data = this.getData();
        const match = data.substring(this.cursor.dataIdx).match(Lexer.FloatRegex);
        if (!match) {
            throw mkCursorError("Invalid float format", startCursor);
        }

        this.advanceCursor(match[0].length);

        return {
            type: TokenType.Float,
            value: match[0],
            ...this.getTokenMeasurement(startCursor),
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
            throw mkCursorError("Expected macro argument", startCursor);
        }

        this.advanceCursor(rawArg.length);
        if (hadComma) {
            this.advanceCursor(1);
        }

        return {
            type: TokenType.MacroBody,
            body: arg,
            ...this.getTokenMeasurement(startCursor),
        };
    }

    public unget(tok: Tokens.Token) {
        const fromSubst = (this.cursor.activeSubst !== undefined);
        const toSubst = (tok.cursor.activeSubst !== undefined);

        if (fromSubst != toSubst) {
            throw mkCursorError("Can't unget across substitution boundaries", this.cursor);
        }

        this.ungetCache = tok;
        this.ungetCursor = { ...this.cursor };
        this.cursor = tok.cursor;
    }

    private getData(): string {
        // are we inside a text substitution?
        if (this.cursor.activeSubst) {
            if (this.cursor.dataIdx < this.cursor.activeSubst.length) {
                return this.cursor.activeSubst;
            } else {
                this.cursor = this.savedCursor!;
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
        if (!subst || this.savedCursor || this.cursor.activeSubst) {
            throw mkCursorError("Logic error in substitution", this.cursor);
        }

        this.savedCursor = this.cursor;
        this.cursor = {
            inputName: `${this.inputName}:APPLY_${symbol}`,
            activeSubst: subst,
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
            ...this.getTokenMeasurement(startCursor),
        };
    }

    private toBlank(first: Tokens.BlankChr): Tokens.BlankToken {
        const startCursor = this.cursor;
        this.advanceCursor(1);
        return {
            type: TokenType.Blank,
            char: first,
            ...this.getTokenMeasurement(startCursor),
        };
    }

    private scanSymbol(data: string): Tokens.SymbolToken {
        const startCursor = this.cursor;
        const match = data.substring(startCursor.dataIdx).match(Lexer.SymbolRegex);
        if (!match) {
            throw mkCursorError("Expected symbol", startCursor);
        }
        const symbol = match[1];
        this.advanceCursor(symbol.length);

        return {
            type: TokenType.Symbol,
            name: symbol,
            ...this.getTokenMeasurement(startCursor),
        };
    }

    private scanInt(data: string): Tokens.IntegerToken {
        const startCursor = this.cursor;
        const match = data.substring(startCursor.dataIdx).match(Lexer.IntRegex);
        if (!match) {
            throw mkCursorError("Expected integer", startCursor);
        }
        const int = match[1];
        this.advanceCursor(int.length);
        return {
            type: TokenType.Integer,
            value: int,
            ...this.getTokenMeasurement(startCursor),
        };
    }

    private scanComment(data: string): Tokens.CommentToken {
        const startCursor = this.cursor;
        const match = data.substring(startCursor.dataIdx).match(Lexer.CommentRegEx);
        if (!match) {
            throw mkCursorError("Expected comment", startCursor);
        }
        const comment = match[1];
        this.advanceCursor(1 + comment.length);

        return {
            type: TokenType.Comment,
            comment: comment,
            ...this.getTokenMeasurement(startCursor),
        };
    }

    private scanMacroBody(data: string): Tokens.MacroBodyToken {
        const startCursor = this.cursor;
        this.advanceCursor(1); // skip first '<'
        let body = "";
        let level = 1;
        let inComment = false;
        for (; this.cursor.dataIdx < data.length; this.advanceCursor(1)) {
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
        }

        if (level != 0) {
            throw mkCursorError("Unterminated macro body", startCursor);
        }
        return { type: TokenType.MacroBody, body, ...this.getTokenMeasurement(startCursor) };
    }

    private skipToLineBreak(data: string): string {
        let res = "";
        for (; this.cursor.dataIdx < data.length; this.advanceCursor(1)) {
            res += data[this.cursor.dataIdx];
            if (this.isLineBreak(data[this.cursor.dataIdx])) {
                break;
            }
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
            ...this.getTokenMeasurement(startCursor),
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
                ...this.getTokenMeasurement(startCursor),
            };
        }

        // non-operator characters get their own token
        switch (chr) {
            case "$":
                return {
                    type: TokenType.EOF,
                    char: chr,
                    ...this.getTokenMeasurement(startCursor),
                };
            case ";":
                return {
                    type: TokenType.Separator,
                    char: chr,
                    ...this.getTokenMeasurement(startCursor),
                };
        }

        throw mkCursorError(`Unexpected character '${replaceBlanks(chr)}'`, startCursor);
    }

    private advanceCursor(step: number) {
        const data = this.getData();
        // make sure to create a new object so that the references in next() keep their state
        const newCursor = { ...this.cursor };

        for (let i = 0; i < step; i++) {
            if (newCursor.dataIdx < data.length) {
                if (data[newCursor.dataIdx] == "\n") {
                    newCursor.lineIdx++;
                    newCursor.colIdx = 0;
                }
            }
            newCursor.dataIdx++;
            newCursor.colIdx++;
        }

        this.cursor = newCursor;
    }

    private isOperator(chr: string): chr is Tokens.OperatorChr {
        return Tokens.OperatorChars.includes(chr);
    }

    private isLineBreak(chr: string): chr is Tokens.LineBreakChr {
        return chr == "\r" || chr == "\n";
    }

    private isBlank(chr: string): chr is Tokens.BlankChr {
        return chr == " " || chr == "\t" || chr == "\f";
    }

    private getTokenMeasurement(start: Cursor): { cursor: Cursor, width: number } {
        const end = this.cursor;

        return {
            cursor: start,
            width: end.dataIdx - start.dataIdx,
        };
    }
}
