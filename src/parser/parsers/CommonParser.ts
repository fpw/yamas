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

import { Lexer } from "../../lexer/Lexer";
import * as Tokens from "../../lexer/Token";
import { TokenType } from "../../lexer/Token";
import * as Nodes from "../Node";
import { NodeType } from "../Node";
import { Parser, ParserOptions } from "../Parser";

export class CommonParser {
    public constructor(private opts: ParserOptions, private lexer: Lexer) {
    }

    public parseElement(): Nodes.Element {
        const tok = this.lexer.nextNonBlank();

        switch (tok.type) {
            case TokenType.ASCII:   return { type: NodeType.ASCIIChar, token: tok };
            case TokenType.Symbol:  return this.parseSymbol(tok);
            case TokenType.Integer: return this.parseInteger(tok);
            case TokenType.Char:
                if (tok.char == ".") {
                    return { type: NodeType.CLCValue, token: tok };
                } else if (tok.char == "+" || tok.char == "-") {
                    return {
                        type: NodeType.UnaryOp,
                        operator: tok.char,
                        elem: this.parseElement(),
                        token: tok,
                    };
                }
                break;
        }
        throw Parser.mkTokError(`Element expected, got ${Tokens.tokenToString(tok)}`, tok);
    }

    public parseSymbol(gotTok?: Tokens.SymbolToken): Nodes.SymbolNode {
        if (!gotTok) {
            const next = this.lexer.nextNonBlank();
            if (next.type != TokenType.Symbol) {
                throw Parser.mkTokError("Symbol expected", next);
            }
            gotTok = next;
        }
        return { type: NodeType.Symbol, token: gotTok };
    }

    public parseInteger(tok: Tokens.IntegerToken): Nodes.Integer {
        return { type: NodeType.Integer, token: tok };
    }

    public parseSeparator(tok: Tokens.EOLToken | Tokens.SeparatorToken): Nodes.StatementSeparator {
        if (tok.type == TokenType.EOL) {
            return { type: NodeType.Separator, separator: "\n", token: tok };
        } else {
            return { type: NodeType.Separator, separator: tok.char, token: tok };
        }
    }

    public parseComment(tok: Tokens.CommentToken): Nodes.Comment {
        return { type: NodeType.Comment, token: tok };
    }
}
