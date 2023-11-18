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
import { ParserError } from "../ParserError.js";
import * as Tokens from "../../lexer/Token.js";
import { TokenType } from "../../lexer/Token.js";
import * as Nodes from "../nodes/Node.js";
import { NodeType } from "../nodes/Node.js";
import { ParserOptions } from "../Parser.js";

export class CommonParser {
    public constructor(private opts: ParserOptions, private lexer: Lexer) {
    }

    public parseElement(gotTok?: Tokens.Token): Nodes.Element {
        let token = gotTok ?? this.lexer.nextNonBlank(false, gotTok);

        const base: Omit<Nodes.Element, "node"> = {
            type: NodeType.Element,
            unaryOp: undefined,
            extent: token.extent,
        };

        if (token.type == TokenType.Char && (token.char == "+" || token.char == "-")) {
            base.unaryOp = this.toUnaryOp(token);
            token = this.lexer.next();
            base.extent.width += token.extent.width;
        }

        switch (token.type) {
            case TokenType.ASCII:   return { ...base, node: this.toAscii(token) };
            case TokenType.Symbol:  return { ...base, node: this.parseSymbol(token) };
            case TokenType.Integer: return { ...base, node: this.parseInteger(token) };
            case TokenType.Char:
                if (token.char == ".") {
                    return { ...base, node: this.toCLC(token) };
                }
                break;
        }

        throw new ParserError(`Element expected, got ${tokenToString(token)}`, token);
    }

    public toUnaryOp(tok: Tokens.CharToken): Nodes.UnaryOp {
        if ((tok.char == "+" || tok.char == "-")) {
            return { type: NodeType.UnaryOp, operator: tok.char, extent: tok.extent };
        }
        throw Error(`Invalid unary operator: ${tok.char}`);
    }

    private toCLC(tok: Tokens.CharToken): Nodes.CLCValue {
        return { type: NodeType.CLCValue, extent: tok.extent };
    }

    private toAscii(tok: Tokens.ASCIIToken): Nodes.ASCIIChar {
        return { type: NodeType.ASCIIChar, char: tok.char, extent: tok.extent };
    }

    public parseSymbol(gotTok?: Tokens.SymbolToken): Nodes.SymbolNode {
        if (!gotTok) {
            const next = this.lexer.nextNonBlank(false);
            if (next.type != TokenType.Symbol) {
                throw new ParserError("Symbol expected", next);
            }
            gotTok = next;
        }
        return { type: NodeType.Symbol, name: gotTok.name, extent: gotTok.extent };
    }

    public parseInteger(tok: Tokens.IntegerToken): Nodes.Integer {
        return { type: NodeType.Integer, value: tok.value, extent: tok.extent };
    }

    public parseSeparator(tok: Tokens.EOLToken | Tokens.SeparatorToken | Tokens.EOFToken): Nodes.StatementSeparator {
        if (tok.type == TokenType.EOL) {
            return { type: NodeType.Separator, separator: "\n", extent: tok.extent };
        } else if (tok.type == TokenType.Separator) {
            return { type: NodeType.Separator, separator: tok.char, extent: tok.extent };
        } else  {
            return { type: NodeType.Separator, separator: "EOF", extent: tok.extent };
        }
    }

    public parseComment(tok: Tokens.CommentToken): Nodes.Comment {
        return { type: NodeType.Comment, comment: tok.comment, extent: tok.extent };
    }

    public isStatementEnd(tok: Tokens.Token) {
        switch (tok.type) {
            case Tokens.TokenType.EOL:
            case Tokens.TokenType.EOF:
            case Tokens.TokenType.Separator:
            case Tokens.TokenType.Comment:
                return true;
            case Tokens.TokenType.Symbol:
            case Tokens.TokenType.Blank:
            case Tokens.TokenType.Integer:
            case Tokens.TokenType.Float:
            case Tokens.TokenType.Char:
            case Tokens.TokenType.ASCII:
            case Tokens.TokenType.String:
            case Tokens.TokenType.MacroBody:
                return false;
        }
    }

    public parseStatementEnd(gotTok?: Tokens.Token): Nodes.StatementSeparator | Nodes.Comment {
        const tok = this.lexer.nextNonBlank(false, gotTok);
        if (tok.type == TokenType.Comment) {
            return this.parseComment(tok);
        } else if (tok.type == TokenType.EOL || tok.type == TokenType.Separator || tok.type == TokenType.EOF) {
            return this.parseSeparator(tok);
        } else {
            throw new ParserError(`End of statement expected, got ${tokenToString(tok)}`, tok);
        }
    }
}
