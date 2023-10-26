export class ParserError extends Error {
    public inputName: string;
    public line: number;
    public col: number;

    public constructor(msg: string, inputName: string, line: number, col: number) {
        super(msg);
        this.name = ParserError.name;
        this.inputName = inputName;
        this.line = line;
        this.col = col;
    }
}