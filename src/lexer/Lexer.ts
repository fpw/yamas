import { Token, TokenType, SymbolToken } from "./Token";

export class Lexer {
    private inputs: {name: string, lines: string[]}[] = [];
    private inputIdx = 0;
    private inputLine = 0;
    private inputCol = 0;

    public addInput(name: string, data: string) {
        this.inputs.push({name, lines: data.split("\n")});
    }

    public next(includeBlank: boolean): Token {
        const base = {
            fileIdx: this.inputIdx,
            line: this.inputLine + 1,
            startCol: this.inputCol,
        };

        if (this.inputIdx >= this.inputs.length) {
            return {
                type: TokenType.EOF,
                endCol: base.startCol + 1,
                ...base,
            };
        }

        const {name, lines} = this.inputs[this.inputIdx];
        if (this.inputLine >= lines.length) {
            this.inputLine = 0;
            this.inputIdx++;
            return {
                type: TokenType.EOL,
                char: "\f",
                endCol: base.startCol + 1,
                ...base,
            };
        }

        const line = lines[this.inputLine];
        if (this.inputCol >= line.length) {
            this.inputCol = 0;
            this.inputLine++;
            return {
                type: TokenType.EOL,
                char: "\n",
                endCol: base.startCol + 1,
                ...base,
            };
        }

        const start = line[this.inputCol];

        if (start.match(/\s/)) {
            this.inputCol++;
            if (!includeBlank) {
                return this.next(includeBlank);
            }
            return {
                type: TokenType.Blank,
                char: start,
                endCol: base.startCol + 1,
                ...base
            };
        } else if (start.match(/[A-Z]/)) {
            let symbol = "";
            for (let i = this.inputCol; i < line.length; i++) {
                if (line[i].match(/[A-Z]/)) {
                    symbol += line[i];
                } else {
                    break;
                }
            }
            this.inputCol += symbol.length;
            return {
                type: TokenType.Symbol,
                symbol: symbol,
                endCol: base.startCol + symbol.length,
                ...base
            };
        } else if (start.match(/[0-9]/)) {
            let int = "";
            for (let i = this.inputCol; i < line.length; i++) {
                if (line[i].match(/[0-9]/)) {
                    int += line[i];
                } else {
                    break;
                }
            }
            this.inputCol += int.length;
            return {
                type: TokenType.Integer,
                value: int,
                endCol: base.startCol + int.length,
                ...base
            };
        } else if (start == "/") {
            let comment = "";
            this.inputCol++;
            for (let i = this.inputCol; i < line.length; i++) {
                comment += line[i];
            }
            this.inputCol += comment.length;
            return {
                type: TokenType.Comment,
                comment: comment,
                endCol: base.startCol + comment.length,
                ...base
            };
        } else if (start == "<") {
            let seq = "";
            this.inputCol++;
            for (let i = this.inputCol; i < line.length; i++) {
                if (line[i] == ">") {
                    break;
                }
                seq += line[i];
            }
            this.inputCol += seq.length + 1; // also skip >
            return {
                type: TokenType.RawSequence,
                body: seq,
                endCol: base.startCol + seq.length + 1,
                ...base
            };
        } else {
            this.inputCol++;
            return {
                type: TokenType.Char,
                char: start,
                endCol: base.startCol + 1,
                ...base
            };
        }
    }

    public skipChar(char: string) {
        const tok = this.next(true);
        if (tok.type != TokenType.Char) {
            throw Error(`Expected "${char}", got ${tok.type}`);
        }
        if (tok.char != tok.char) {
            throw Error(`Expected "${char}", got ${tok.char}`);
        }
    }

    public peekNext(): string | undefined {
        if (this.inputIdx >= this.inputs.length) {
            return undefined;
        } else if (this.inputLine >= this.inputs[this.inputIdx].lines.length) {
            return undefined;
        } else if (this.inputCol >= this.inputs[this.inputIdx].lines[this.inputLine].length) {
            return undefined;
        }
        return this.inputs[this.inputIdx].lines[this.inputLine][this.inputCol];
    }

    public unget(tok: Token) {
        this.inputIdx = tok.fileIdx;
        this.inputLine = tok.line - 1;
        this.inputCol = tok.startCol;
    }
}
