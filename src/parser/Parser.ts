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

import { mkCursorError } from "../lexer/Cursor.js";
import { Lexer } from "../lexer/Lexer.js";
import { CodeError } from "../utils/CodeError.js";
import * as Nodes from "./nodes/Node.js";
import { NodeType } from "./nodes/Node.js";
import { PseudoParser } from "./parsers/PseudoParser.js";
import { StatementParser } from "./parsers/StatementParser.js";

export interface ParserOptions {
    // disable given pseudos to use them as custom symbol names
    disabledPseudos?: string[];
}

export class Parser {
    public static readonly SupportedPseudos = PseudoParser.SupportedPseudos;
    private options: ParserOptions;
    private lexer: Lexer;
    private stmtParser: StatementParser;

    public constructor(options: ParserOptions, inputName: string, input: string) {
        this.options = options;
        this.lexer = new Lexer(inputName, input);
        this.stmtParser = new StatementParser(this.options, this.lexer);
    }

    public addSubstitution(symbol: string, body: string) {
        this.lexer.addSubstitution(symbol, body);
    }

    public parseProgram(): Nodes.Program {
        const prog: Nodes.Program = {
            type: NodeType.Program,
            inputName: this.lexer.getInputName(),
            stmts: [],
            errors: [],
        };

        while (true) {
            try {
                const stmt = this.stmtParser.parseStatement();
                if (!stmt) {
                    break;
                }

                prog.stmts.push(stmt);
            } catch (e) {
                if (e instanceof CodeError) {
                    prog.errors.push(e);
                } else if (e instanceof Error) {
                    prog.errors.push(mkCursorError(e.message, this.lexer.getCursor()));
                }
                this.lexer.ignoreCurrentLine();
            }
        };

        return prog;
    }
}
