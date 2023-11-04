import { CodeError } from "../utils/CodeError.js";

export interface Cursor {
    inputName: string;
    dataIdx: number;
    colIdx: number;
    lineIdx: number;

    // set if we are inside a text substitution, i.e. a macro argument appearing inside the body
    // will be set to the actual text of the substitution to avoid repeated lookups
    activeSubst?: string;
}

export function mkCursorError(msg: string, cursor: Cursor): CodeError {
    return new CodeError(msg, cursor.inputName, cursor.lineIdx + 1, cursor.colIdx + 1);
}
