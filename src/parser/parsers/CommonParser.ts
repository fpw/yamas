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

import { tokenToString } from "../../lexer/formatToken.js";
import { Lexer } from "../../lexer/Lexer.js";
import * as Tokens from "../../lexer/Token.js";
import { TokenType } from "../../lexer/Token.js";
import * as Nodes from "../nodes/Node.js";
import { NodeType } from "../nodes/Node.js";
import { ParserOptions } from "../Parser.js";

export class CommonParser {
    public constructor(private opts: ParserOptions, private lexer: Lexer) {
    }

    public parseElement(gotTok?: Tokens.Token): Nodes.Element {
        let tok = gotTok ?? this.lexer.nextNonBlank(false, gotTok);
        let unary: Nodes.UnaryOp | undefined;

        if (tok.type == TokenType.Char && (tok.char == "+" || tok.char == "-")) {
            unary = this.toUnaryOp(tok);
            tok = this.lexer.next();
        }

        const base: Omit<Nodes.Element, "node"> = {
            type: NodeType.Element,
            unaryOp: unary,
        };

        switch (tok.type) {
            case TokenType.ASCII:   return { ...base, node: this.toAscii(tok) };
            case TokenType.Symbol:  return { ...base, node: this.parseSymbol(tok) };
            case TokenType.Integer: return { ...base, node: this.parseInteger(tok) };
            case TokenType.Char:
                if (tok.char == ".") {
                    return { ...base, node: this.toCLC(tok) };
                }
                break;
        }

        throw Tokens.mkTokError(`Element expected, got ${tokenToString(tok)}`, tok);
    }

    public toUnaryOp(tok: Tokens.CharToken): Nodes.UnaryOp {
        if ((tok.char == "+" || tok.char == "-")) {
            return { type: NodeType.UnaryOp, operator: tok.char, token: tok };
        }
        throw Error(`Invalid unary operator: ${tok.char}`);
    }

    private toCLC(tok: Tokens.CharToken): Nodes.CLCValue {
        return { type: NodeType.CLCValue, token: tok };
    }

    private toAscii(tok: Tokens.ASCIIToken): Nodes.ASCIIChar {
        return { type: NodeType.ASCIIChar, char: tok.char, token: tok };
    }

    public parseSymbol(gotTok?: Tokens.SymbolToken): Nodes.SymbolNode {
        if (!gotTok) {
            const next = this.lexer.nextNonBlank(false);
            if (next.type != TokenType.Symbol) {
                throw Tokens.mkTokError("Symbol expected", next);
            }
            gotTok = next;
        }
        return { type: NodeType.Symbol, name: gotTok.name, token: gotTok };
    }

    public parseInteger(tok: Tokens.IntegerToken): Nodes.Integer {
        return { type: NodeType.Integer, value: tok.value, token: tok };
    }

    public parseSeparator(tok: Tokens.EOLToken | Tokens.SeparatorToken): Nodes.StatementSeparator {
        if (tok.type == TokenType.EOL) {
            return { type: NodeType.Separator, separator: "\n", token: tok };
        } else {
            return { type: NodeType.Separator, separator: tok.char, token: tok };
        }
    }

    public parseComment(tok: Tokens.CommentToken): Nodes.Comment {
        return { type: NodeType.Comment, comment: tok.comment, token: tok };
    }
}
