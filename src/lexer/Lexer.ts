import { ASCIIToken, BlankToken, CharToken, CommentToken, EOLToken, IntegerToken, RawSequenceToken, SymbolToken, TextToken, Token, TokenType, tokenToString } from "./Token";

export interface Cursor {
    fileIdx: number;
    dataIdx: number;
    lineIdx: number;
}

export class Lexer {
    private inputs: {name: string, data: string, lineTable: number[]}[] = [];
    private cursor: Cursor;

    public constructor() {
        this.cursor = {
            fileIdx: 0,
            dataIdx: 0,
            lineIdx: 0,
        };
    }

    public getCursor(): Cursor {
        return this.cursor;
    }

    public addInput(name: string, data: string) {
        this.inputs.push({name, data, lineTable: [0]});
    }

    public getCursorString(): string {
        if (this.cursor.fileIdx >= this.inputs.length) {
            return "EOF";
        }

        let col: number | undefined;
        const lineTable = this.inputs[this.cursor.fileIdx].lineTable;
        for (let lineIdx = 0; lineIdx < lineTable.length; lineIdx++) {
            if (this.cursor.dataIdx < lineTable[lineIdx]) {
                col = this.cursor.dataIdx - lineTable[lineIdx - 1];
                break;
            }
        }

        if (col === undefined) {
            col = this.cursor.dataIdx - lineTable[lineTable.length - 1];
        }

        const fileName = this.inputs[this.cursor.fileIdx].name;
        return `${fileName}:${this.cursor.lineIdx + 1}:${col + 1}`;
    }

    public next(): Token {
        const startCursor = this.cursor;

        // no more files -> EOF
        if (this.cursor.fileIdx == this.inputs.length) {
            return {
                type: TokenType.EOF,
                cursor: startCursor,
                width: 0,
            };
        }

        const data = this.inputs[startCursor.fileIdx].data;

        // end of file, but there might be more -> EOL with form feed to indicate file switch
        if (this.cursor.dataIdx == data.length) {
            this.advanceCursor(1);
            return {
                type: TokenType.EOL,
                char: "\f",
                cursor: startCursor,
                width: 0,
            };
        }

        return this.scanFromData(data);
    }

    public nextNonBlank(): Token {
        while (true) {
            const next = this.next();
            if (next.type != TokenType.Blank) {
                return next;
            }
        }
    }

    private scanFromData(data: string): Token {
        const first = data[this.cursor.dataIdx];

        if (first == "\r" || first == "\n") {
            return this.scanNewLine(data);
        } else if (first == " " || first == "\t" || first == "\f") {
            return this.scanBlank(data);
        } else if (first >= "A" && first <= "Z") {
            return this.scanSymbol(data);
        } else if (first >= "0" && first <= "9") {
            return this.scanInt(data);
        } else if (first == "/") {
            return this.scanComment(data);
        } else if (first == "<") {
            return this.scanRawSequence(data);
        } else if (first == "\"") {
            return this.scanASCII(data);
        } else {
            return this.scanChar(data);
        }
    }

    private scanNewLine(data: string): EOLToken {
        const startCursor = this.cursor;
        this.advanceCursor(1);
        return {
            type: TokenType.EOL,
            char: data[startCursor.dataIdx] as "\r" | "\n",
            cursor: startCursor,
            width: this.cursorDiff(startCursor, this.cursor),
        };
    }

    private scanBlank(data: string): BlankToken {
        const startCursor = this.cursor;
        const blank = data[startCursor.dataIdx] as "\t" | "\f" | " ";
        this.advanceCursor(1);
        return {
            type: TokenType.Blank,
            cursor: startCursor,
            char: blank,
            width: this.cursorDiff(startCursor, this.cursor),
        };
    }

    private scanSymbol(data: string): SymbolToken | TextToken {
        const startCursor = this.cursor;
        let symbol = "";
        for (let i = this.cursor.dataIdx; i < data.length; i++) {
            if ((data[i] >= "A" && data[i] <= "Z") || (data[i] >= "0" && data[i] <= "9")) {
                symbol += data[i];
            } else {
                break;
            }
        }
        this.advanceCursor(symbol.length);

        if (symbol == "TEXT") {
            return this.scanText(data);
        }

        return {
            type: TokenType.Symbol,
            symbol: symbol,
            cursor: startCursor,
            width: this.cursorDiff(startCursor, this.cursor),
        };
    }

    private scanText(data: string): TextToken {
        const startCursor = this.cursor;
        this.advanceCursor(1);
        const delim = data[this.cursor.dataIdx];
        this.advanceCursor(1);
        let text = "";
        for (let i = this.cursor.dataIdx; i < data.length; i++) {
            this.advanceCursor(1);
            if (data[i] == delim) {
                break;
            } else if (data[i] == "\r" || data[i] == "\n") {
                throw Error("Unterminated TEXT", {cause: startCursor});
            }
            text += data[i];
        }
        return {
            type: TokenType.Text,
            delim: delim,
            text: text,
            cursor: startCursor,
            width: this.cursorDiff(startCursor, this.cursor),
        };
    }

    private scanInt(data: string): IntegerToken {
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
            type: TokenType.Integer,
            value: int,
            cursor: startCursor,
            width: this.cursorDiff(startCursor, this.cursor),
        };
    }

    private scanComment(data: string): CommentToken {
        const startCursor = this.cursor;
        let comment = "";
        this.advanceCursor(1);
        for (let i = this.cursor.dataIdx; i < data.length; i++) {
            if (data[i] == "\r" || data[i] == "\n") {
                break;
            }
            comment += data[i];
        }
        this.advanceCursor(comment.length);
        return {
            type: TokenType.Comment,
            comment: comment,
            cursor: startCursor,
            width: this.cursorDiff(startCursor, this.cursor),
        };
    }

    private scanRawSequence(data: string): RawSequenceToken {
        const startCursor = this.cursor;
        let seq = "";
        this.advanceCursor(1);
        let remain = 1;
        while (remain > 0) {
            for (let i = this.cursor.dataIdx; i < data.length; i++) {
                this.advanceCursor(1);
                if (data[i] == ">") {
                    remain--;
                    if (remain == 0) {
                        break;
                    }
                } else if (data[i] == "<") {
                    remain++;
                }
                seq += data[i];
            }
        }

        return {
            type: TokenType.RawSequence,
            body: seq,
            cursor: startCursor,
            width: this.cursorDiff(startCursor, this.cursor),
        };
    }

    private scanASCII(data: string): ASCIIToken {
        const startCursor = this.cursor;
        this.advanceCursor(1);
        const chr = data[this.cursor.dataIdx];
        this.advanceCursor(1);
        return {
            type: TokenType.ASCII,
            char: chr,
            cursor: startCursor,
            width: this.cursorDiff(startCursor, this.cursor),
        };
    }

    private scanChar(data: string): CharToken {
        const startCursor = this.cursor;
        this.advanceCursor(1);
        return {
            type: TokenType.Char,
            char: data[startCursor.dataIdx],
            cursor: startCursor,
            width: this.cursorDiff(startCursor, this.cursor),
        };
    }

    private advanceCursor(step: number) {
        const file = this.inputs[this.cursor.fileIdx];
        const data = file.data;
        const newCursor = {...this.cursor};

        for (let i = 0; i < step; i++) {
            // we want to generate EOL \f *after* the file, so introduce a virtual character
            if (this.cursor.dataIdx == data.length) {
                if (this.cursor.fileIdx < this.inputs.length) {
                    newCursor.fileIdx++;
                    newCursor.dataIdx = 0;
                    newCursor.lineIdx = 0;
                }
            } else {
                if (data[this.cursor.dataIdx] == "\n") {
                    // we're skipping over a line -> update table
                    this.inputs[newCursor.fileIdx].lineTable[++newCursor.lineIdx] = newCursor.dataIdx + 1;
                }
                newCursor.dataIdx++;
            }
        }

        // make sure to create a new object so that next() can copy a reference
        this.cursor = newCursor;
    }

    private cursorDiff(a: Cursor, b: Cursor): number {
        if (a.fileIdx != b.fileIdx) {
            throw Error("Can't diff cursors across files", {cause: this.cursor});
        }
        return b.dataIdx - a.dataIdx;
    }

    public unget(tok: Token) {
        this.cursor = tok.cursor;
    }
}
