import { CodeError } from "../utils/CodeError";
import { replaceBlanks } from "../utils/Strings";
import * as Tokens from "./Token";

export interface Cursor {
    inputName: string;
    dataIdx: number;
    colIdx: number;
    lineIdx: number;

    // set if we are inside a text substitution, i.e. a macro argument appearing inside the body
    // will be set to the actual text of the substitution to avoid repeated lookups
    activeSubst?: string;
}

export class Lexer {
    private inputName: string;
    private data: string;
    private lineTable: number[] = [];
    private cursor: Cursor;
    private savedCursor?: Cursor;
    private substitutions = new Map<string, string>();

    public constructor(inputName: string, input: string) {
        this.inputName = inputName;
        this.data = input;
        this.lineTable = [0];

        this.cursor = {
            inputName: inputName,
            dataIdx: 0,
            colIdx: 0,
            lineIdx: 0,
        };
    }

    public addSubstitution(symbol: string, sub: string) {
        this.substitutions.set(symbol, sub);
    }

    public next(): Tokens.Token {
        // are we inside a text substitution?
        if (this.cursor.activeSubst) {
            if (this.cursor.dataIdx < this.cursor.activeSubst.length) {
                return this.scanFromData(this.cursor.activeSubst);
            } else {
                this.cursor = this.savedCursor!;
                this.savedCursor = undefined;
            }
        }

        return this.scanFromCursor();
    }

    public nextNonBlank(): Tokens.Token {
        while (true) {
            const next = this.next();
            if (next.type != Tokens.TokenType.Blank) {
                return next;
            }
        }
    }

    // eslint-disable-next-line max-lines-per-function
    public nextStringLiteral(delim: boolean): [Tokens.StringToken, string] {
        const startCursor = this.cursor;
        const data = this.data;

        while (data[this.cursor.dataIdx] == " " || data[this.cursor.dataIdx] == "\t") {
            this.advanceCursor(1);
        }

        let delimChr: string | undefined;
        if (delim) {
            delimChr = data[this.cursor.dataIdx];
            this.advanceCursor(1);
        }

        let str = "";
        for (let i = this.cursor.dataIdx; i < data.length; i++) {
            this.advanceCursor(1);
            if (data[i] === delimChr) {
                break;
            } else if (data[i] == "/" && !delim) {
                str = str.trim();
                this.cursor.dataIdx--;
                break;
            } else if (this.isLineBreak(data[i])) {
                if (delim) {
                    throw Lexer.mkError("Unterminated delimiter string", startCursor);
                }
                break;
            }
            str += data[i];
        }

        const tok: Tokens.StringToken = {
            type: Tokens.TokenType.String,
            str: str,
            ...this.getTokenMeasurement(startCursor),
        };
        return [tok, delimChr ?? ""];
    }

    private floatRegex = /^[-+]?(\d+\.\d*|\d*\.\d+|\d+)([eE][-+]?\d+)?/;
    public nextFloat(): Tokens.FloatToken {
        const startCursor = this.cursor;
        const match = this.data.substring(this.cursor.dataIdx).match(this.floatRegex);
        if (!match) {
            throw Lexer.mkError("Invalid float format", startCursor);
        }

        this.advanceCursor(match[0].length);

        return {
            type: Tokens.TokenType.Float,
            float: Number.parseFloat(match[0]),
            ...this.getTokenMeasurement(startCursor),
        };
    }

    public nextMacroArgument(): Tokens.MacroBodyToken {
        const startCursor = this.cursor;
        const data = this.data;

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
            throw Lexer.mkError("Expected macro argument", startCursor);
        }

        this.advanceCursor(rawArg.length + (hadComma ? 1 : 0));
        if (hadComma) {
            this.advanceCursor(1);
        }

        return {
            type: Tokens.TokenType.MacroBody,
            body: arg,
            ...this.getTokenMeasurement(startCursor),
        };
    }

    public unget(tok: Tokens.Token) {
        const fromSubst = (this.cursor.activeSubst !== undefined);
        const toSubst = (tok.cursor.activeSubst !== undefined);

        if (fromSubst != toSubst) {
            throw Lexer.mkError("Can't unget across substitution boundaries", this.cursor);
        }

        this.cursor = tok.cursor;
    }

    private isLineBreak(chr: string) {
        return chr == "\r" || chr == "\n" || chr == "\f";
    }

    private scanFromCursor(): Tokens.Token {
        const startCursor = this.cursor;

        if (this.cursor.dataIdx >= this.data.length) {
            return {
                type: Tokens.TokenType.EOF,
                cursor: startCursor,
                width: 0,
            };
        }

        return this.scanFromData(this.data);
    }

    private scanFromData(data: string): Tokens.Token {
        const first = data[this.cursor.dataIdx];

        if (this.isLineBreak(first)) {
            return this.scanNewLine(data);
        } else if (first == " " || first == "\t" || first == "\f") {
            return this.scanBlank(data);
        } else if ((first >= "A" && first <= "Z") || (first >= "a" && first <= "z")) {
            const sym = this.scanSymbol(data);
            if (sym.type == Tokens.TokenType.Symbol && this.substitutions.has(sym.symbol)) {
                this.activateSubstitution(sym.symbol);
                return this.next();
            } else {
                return sym;
            }
        } else if (first >= "0" && first <= "9") {
            return this.scanInt(data);
        } else if (first == "/") {
            return this.scanComment(data);
        } else if (first == "<") {
            return this.scanMacroBody(data);
        } else if (first == '"') {
            return this.scanASCII(data);
        } else {
            return this.scanChar(data);
        }
    }

    private activateSubstitution(symbol: string) {
        const subst = this.substitutions.get(symbol);
        if (!subst || this.savedCursor || this.cursor.activeSubst) {
            throw Lexer.mkError("Logic error in substitution", this.cursor);
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

    private scanNewLine(data: string): Tokens.EOLToken {
        const startCursor = this.cursor;
        this.advanceCursor(1);
        return {
            type: Tokens.TokenType.EOL,
            char: data[startCursor.dataIdx] as "\r" | "\n" | "\f",
            ...this.getTokenMeasurement(startCursor),
        };
    }

    private scanBlank(data: string): Tokens.BlankToken {
        const startCursor = this.cursor;
        const blank = data[startCursor.dataIdx] as "\t" | " ";
        this.advanceCursor(1);
        return {
            type: Tokens.TokenType.Blank,
            char: blank,
            ...this.getTokenMeasurement(startCursor),
        };
    }

    private scanSymbol(data: string): Tokens.SymbolToken {
        const startCursor = this.cursor;
        let symbol = "";
        for (let i = this.cursor.dataIdx; i < data.length; i++) {
            const c = data[i].toUpperCase();
            if ((c >= "A" && c <= "Z") || (c >= "0" && c <= "9")) {
                symbol += c;
            } else {
                break;
            }
        }
        this.advanceCursor(symbol.length);

        return {
            type: Tokens.TokenType.Symbol,
            symbol: symbol,
            ...this.getTokenMeasurement(startCursor),
        };
    }

    private scanInt(data: string): Tokens.IntegerToken {
        const startCursor = this.cursor;
        let int = "";
        for (let i = this.cursor.dataIdx; i < data.length; i++) {
            if (data[i] >= "0" && data[i] <= "9") {
                int += data[i];
            } else {
                break;
            }
        }
        this.advanceCursor(int.length);
        return {
            type: Tokens.TokenType.Integer,
            value: int,
            ...this.getTokenMeasurement(startCursor),
        };
    }

    private scanComment(data: string): Tokens.CommentToken {
        const startCursor = this.cursor;
        let comment = "";
        this.advanceCursor(1);
        for (let i = this.cursor.dataIdx; i < data.length; i++) {
            if (this.isLineBreak(data[i])) {
                break;
            }
            comment += data[i];
        }
        this.advanceCursor(comment.length);
        return {
            type: Tokens.TokenType.Comment,
            comment: comment,
            ...this.getTokenMeasurement(startCursor),
        };
    }

    private scanMacroBody(data: string, allowEndInsideComment = false): Tokens.MacroBodyToken {
        const startCursor = this.cursor;
        let body = "";
        this.advanceCursor(1);
        let remain = 1;
        while (remain > 0 && this.cursor.dataIdx < data.length) {
            for (; this.cursor.dataIdx < data.length; this.advanceCursor(1)) {
                const pos = this.cursor.dataIdx;
                if (data[pos] == ">") {
                    remain--;
                    if (remain == 0) {
                        this.advanceCursor(1);
                        break;
                    }
                } else if (data[pos] == "<") {
                    remain++;
                } else if (data[pos] == "/" && !allowEndInsideComment) {
                    body += this.skipToLineBreak(data);
                    continue;
                }
                body += data[pos];
            }
        }

        if (remain && this.cursor.dataIdx >= data.length) {
            throw Lexer.mkError("Unterminated macro body", startCursor);
        }

        return {
            type: Tokens.TokenType.MacroBody,
            body: body,
            ...this.getTokenMeasurement(startCursor),
        };
    }

    private skipToLineBreak(data: string): string {
        let res = "";
        for (; this.cursor.dataIdx < data.length; this.advanceCursor(1)) {
            res += data[this.cursor.dataIdx];
            if (data[this.cursor.dataIdx] == "\n") {
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
            type: Tokens.TokenType.ASCII,
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
                type: Tokens.TokenType.Char,
                char: chr,
                ...this.getTokenMeasurement(startCursor),
            };
        }

        // non-operator characters get their own token
        switch (chr) {
            case "$":
                return {
                    type: Tokens.TokenType.EOF,
                    char: chr,
                    ...this.getTokenMeasurement(startCursor),
                };
            case ";":
                return {
                    type: Tokens.TokenType.Separator,
                    char: chr,
                    ...this.getTokenMeasurement(startCursor),
                };
        }

        throw Lexer.mkError(`Unexpected character '${replaceBlanks(chr)}'`, startCursor);
    }

    private isOperator(chr: string): chr is Tokens.OperatorChr {
        return Tokens.OperatorChars.includes(chr);
    }

    private advanceCursor(step: number) {
        let data;
        if (this.cursor.activeSubst) {
            data = this.cursor.activeSubst;
        } else {
            data = this.data;
        }
        // make sure to create a new object so that the references in next() keep their state
        const newCursor = {...this.cursor};

        for (let i = 0; i < step; i++) {
            if (this.cursor.dataIdx < data.length) {
                if (data[this.cursor.dataIdx] == "\n") {
                    // we're skipping over a line -> update table
                    if (!newCursor.activeSubst) {
                        this.lineTable[++newCursor.lineIdx] = newCursor.dataIdx + 1;
                    }
                    newCursor.colIdx = 0;
                }
            }
            newCursor.dataIdx++;
            newCursor.colIdx++;
        }

        this.cursor = newCursor;
    }

    private getTokenMeasurement(start: Cursor) {
        const end = this.cursor;

        return {
            cursor: start,
            width: end.dataIdx - start.dataIdx,
        };
    }

    public static mkError(msg: string, cursor: Cursor): CodeError {
        return new CodeError(msg, cursor.inputName, cursor.lineIdx + 1, cursor.colIdx + 1);
    }
}
