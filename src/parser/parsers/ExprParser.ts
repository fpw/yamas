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

import { HasExtent, calcExtent } from "../../lexer/Cursor.js";
import { Lexer } from "../../lexer/Lexer.js";
import * as Tokens from "../../lexer/Token.js";
import { TokenType } from "../../lexer/Token.js";
import { tokenToString } from "../../lexer/formatToken.js";
import { ParserOptions } from "../Parser.js";
import { ParserError } from "../ParserError.js";
import * as Nodes from "../nodes/Node.js";
import { NodeType } from "../nodes/Node.js";
import { CommonParser } from "./CommonParser.js";

type BinOpFragment = { elem: Nodes.Element | Nodes.ParenExpr, op?: Tokens.CharToken };

export class ExprParser {
    public constructor(private opts: ParserOptions, private lexer: Lexer, private commonParser: CommonParser) {
    }

    public parseExpr(gotTok?: Tokens.Token): Nodes.Expression {
        const exprs = this.parseBasicExprs(gotTok);

        if (exprs.length == 0) {
            throw Error("Expression expected");
        } else if (exprs.length == 1) {
            return exprs[0];
        }

        const group: Nodes.ExprGroup = {
            type: NodeType.ExprGroup,
            exprs: exprs,
            extent: calcExtent(exprs[0], exprs[exprs.length - 1]),
        };
        return group;
    }

    private parseBasicExprs(gotTok?: Tokens.Token): Nodes.BasicExpr[] {
        const exprs: Nodes.BasicExpr[] = [];
        while (true) {
            const tok = this.lexer.nextNonBlank(false, gotTok);
            gotTok = undefined;
            if (!this.couldBeInBasicExpr(tok)) {
                this.lexer.unget(tok);
                break;
            }
            const expr = this.parseBasicExpr(tok);
            exprs.push(expr);

            gotTok = this.lexer.next();
            if (gotTok.type != TokenType.Blank) {
                this.lexer.unget(gotTok);
                break;
            }
        }

        return exprs;
    }

    /**
     * Checks whether token could appear inside a basic expression
     * @param tok token to examine
     * @returns true if token could be part of an expression
     */
    private couldBeInBasicExpr(tok: Tokens.Token): boolean {
        switch (tok.type) {
            case TokenType.Integer:
            case TokenType.ASCII:
            case TokenType.Symbol:
                return true;
            case TokenType.Char:
                if (tok.char == ")" || tok.char == "]") {
                    return false;
                } else {
                    return true;
                }
            case TokenType.Blank:
            case TokenType.Comment:
            case TokenType.String:
            case TokenType.Separator:
            case TokenType.Float:
            case TokenType.EOF:
            case TokenType.EOL:
            case TokenType.MacroBody:
                return false;
        }
    }

    private parseBasicExpr(gotTok?: Tokens.Token): Nodes.BasicExpr {
        // all expressions are left-associative, so collect parts and fold
        const fragments: BinOpFragment[] = [];
        while (true) {
            const first = this.lexer.nextNonBlank(false, gotTok);
            gotTok = undefined;
            if (first.type == TokenType.Char && (first.char == "(" || first.char == "[")) {
                const parenExpr = this.parseParenExpr(first);
                fragments.push({ elem: parenExpr });
                break;
            } else {
                const frag = this.parseElemAndOp(first);
                fragments.push(frag);
                if (!frag.op) {
                    break;
                }
            }
        }

        if (fragments.length == 1) {
            return fragments[0].elem;
        }

        return this.foldExpressionParts(fragments);
    }

    private parseParenExpr(gotTok?: Tokens.Token): Nodes.ParenExpr {
        const first = this.lexer.nextNonBlank(false, gotTok);
        if (first.type != TokenType.Char || (first.char != "(" && first.char != "[")) {
            throw new ParserError(`Open parentheses expected, got ${tokenToString(first)}`, first);
        }

        const expr = this.parseExpr();
        const closingParen = this.lexer.nextNonBlank(false);
        let last: HasExtent = closingParen;
        const closingMatch = (first.char == "(" ? ")" : "]");
        if (closingParen.type != TokenType.Char || closingParen.char != closingMatch) {
            this.lexer.unget(closingParen); // ignore non-closed parentheses
            last = expr;
        }

        return {
            type: NodeType.ParenExpr,
            paren: first.char,
            expr: expr,
            extent: calcExtent(first, last),
        };
    }

    /**
     * Parse the next element of an expression and the next operator.
     * @returns The next element of an expression and the operator behind it, if any.
     */
    private parseElemAndOp(gotTok?: Tokens.Token): BinOpFragment {
        const firstElem = this.commonParser.parseElement(gotTok);

        const nextTok = this.lexer.next();
        if (!this.couldBeInBasicExpr(nextTok)) {
            this.lexer.unget(nextTok);
            return { elem: firstElem };
        }

        switch (nextTok.type) {
            case TokenType.Char:
                switch (nextTok.char) {
                    case "+":
                    case "-":
                    case "^":
                    case "%":
                    case "!":
                    case "&":
                        return { elem: firstElem, op: nextTok };
                    default:
                        throw new ParserError(`Unexpected operator in expression: '${nextTok.char}'`, nextTok);
                }
            default:
                this.lexer.unget(nextTok);
                return { elem: firstElem };
        }
    }

    // convert a list of (element, operator) tuples to left-associative expression tree
    private foldExpressionParts(parts: BinOpFragment[]): Nodes.BinaryOp {
        if (parts.length < 2) {
            throw new ParserError("Unexpected end of expression", parts[0].elem);
        }

        if (!parts[0].op) {
            throw new ParserError("No operator in first expression part", parts[0].elem);
        }

        let binOp: Nodes.BinaryOp = {
            type: NodeType.BinaryOp,
            lhs: parts[0].elem,
            operator: parts[0].op.char as Tokens.BinaryOpChr,
            rhs: parts[1].elem,
            extent: calcExtent(parts[0].elem, parts[1].elem),
        };

        for (let i = 1; i < parts.length - 1; i++) {
            const next = parts[i];
            if (!next.op) {
                throw new ParserError("No operator in expression part", next.elem);
            }
            binOp = {
                type: NodeType.BinaryOp,
                lhs: binOp,
                operator: next.op.char as Tokens.BinaryOpChr,
                rhs: parts[i + 1].elem,
                extent: calcExtent(binOp, parts[i + 1].elem),
            };
        }

        return binOp;
    }
}
