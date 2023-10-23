import * as Tokens from "./Token";

export interface Cursor {
    fileIdx: number;
    dataIdx: number;
    lineIdx: number;

    // set if we are inside a text substitution, i.e. a macro argument appearing inside the body
    // will be set to the actual text of the substitution to avoid repeated lookups
    activeSubst?: string;
}

export class Lexer {
    private inputs: {name: string, data: string, lineTable: number[]}[] = [];
    private cursor: Cursor;
    private savedCursor?: Cursor;
    private substitutions = new Map<string, string>();

    public constructor() {
        this.cursor = {
            fileIdx: 0,
            dataIdx: 0,
            lineIdx: 0,
        };
    }

    public addInput(name: string, data: string) {
        this.inputs.push({name, data, lineTable: [0]});
    }

    public addSubstitution(symbol: string, sub: string) {
        this.substitutions.set(symbol, sub);
    }

    public formatCursorString(): string {
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

    public nextMacroArgument(): Tokens.MacroBodyToken {
        const startCursor = this.cursor;
        const data = this.inputs[startCursor.fileIdx].data;

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
            throw Error("Expected macro argument", {cause: startCursor});
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
            throw Error("Can't unget across substitution boundaries");
        }

        this.cursor = tok.cursor;
    }

    private isLineBreak(chr: string) {
        return chr == "\r" || chr == "\n" || chr == "\f";
    }

    private scanFromCursor(): Tokens.Token {
        const startCursor = this.cursor;

        // no more files -> EOF
        if (this.cursor.fileIdx >= this.inputs.length) {
            return {
                type: Tokens.TokenType.EOF,
                cursor: startCursor,
                width: 0,
            };
        }

        const data = this.inputs[startCursor.fileIdx].data;

        // end of current file, but there might be another -> EOL with form feed to indicate file switch
        if (this.cursor.dataIdx >= data.length) {
            this.advanceCursor(1);
            return {
                type: Tokens.TokenType.EOL,
                char: "\f",
                cursor: startCursor,
                width: 0,
            };
        }

        return this.scanFromData(data);
    }

    private scanFromData(data: string): Tokens.Token {
        const first = data[this.cursor.dataIdx];

        if (this.isLineBreak(first)) {
            return this.scanNewLine(data);
        } else if (first == " " || first == "\t" || first == "\f") {
            return this.scanBlank(data);
        } else if (first >= "A" && first <= "Z") {
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
            throw Error("Logic error in substitution");
        }

        this.savedCursor = this.cursor;
        this.cursor = {
            activeSubst: subst,
            dataIdx: 0,
            fileIdx: 0,
            lineIdx: 0,
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

    private scanSymbol(data: string): Tokens.SymbolToken | Tokens.TextToken {
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
            type: Tokens.TokenType.Symbol,
            symbol: symbol,
            ...this.getTokenMeasurement(startCursor),
        };
    }

    private scanText(data: string): Tokens.TextToken {
        const startCursor = this.cursor;
        this.advanceCursor(1);
        const delim = data[this.cursor.dataIdx];
        this.advanceCursor(1);
        let text = "";
        for (let i = this.cursor.dataIdx; i < data.length; i++) {
            this.advanceCursor(1);
            if (data[i] == delim) {
                break;
            } else if (this.isLineBreak(data[i])) {
                throw Error("Unterminated TEXT", {cause: startCursor});
            }
            text += data[i];
        }
        return {
            type: Tokens.TokenType.Text,
            delim: delim,
            text: text,
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

    private scanMacroBody(data: string): Tokens.MacroBodyToken {
        const startCursor = this.cursor;
        let body = "";
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
                body += data[i];
            }
        }

        return {
            type: Tokens.TokenType.MacroBody,
            body: body,
            ...this.getTokenMeasurement(startCursor),
        };
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

        throw Error("Unexpected character", {cause: startCursor});
    }

    private isOperator(chr: string): chr is Tokens.OperatorChr {
        return Tokens.OperatorChars.includes(chr);
    }

    private advanceCursor(step: number) {
        let data;
        if (this.cursor.activeSubst) {
            data = this.cursor.activeSubst;
        } else {
            const file = this.inputs[this.cursor.fileIdx];
            data = file.data;
        }
        // make sure to create a new object so that the references in next() keep their state
        const newCursor = {...this.cursor};

        for (let i = 0; i < step; i++) {
            if (this.cursor.activeSubst) {
                newCursor.dataIdx++;
            } else {
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
        }

        this.cursor = newCursor;
    }

    private getTokenMeasurement(start: Cursor) {
        const end = this.cursor;

        if (start.fileIdx != end.fileIdx) {
            throw Error("Can't diff cursors across files", {cause: this.cursor});
        }

        return {
            cursor: start,
            width: end.dataIdx - start.dataIdx,
        };
    }
}
