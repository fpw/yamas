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

import { Cursor } from "../lexer/Cursor.js";

export class CodeError extends Error {
    public inputName: string;
    public line: number;
    public col: number;

    public constructor(msg: string, cursor: Cursor) {
        super(msg);
        this.name = CodeError.name;

        this.inputName = cursor.inputName;
        this.line = cursor.lineIdx + 1;
        this.col = cursor.colIdx + 1;
    }
}

export function formatCodeError(error: CodeError) {
    return `${error.inputName}:${error.line}:${error.col}: ${error.message}`;
}
