
export class CodeError extends Error {
    public inputName: string;
    public line: number;
    public col: number;

    public constructor(msg: string, inputName: string, line: number, col: number) {
        super(msg);
        this.name = CodeError.name;
        this.inputName = inputName;
        this.line = line;
        this.col = col;
    }
}

export function formatCodeError(error: CodeError) {
    return `${error.inputName}:${error.line}:${error.col}: ${error.message}`;
}
