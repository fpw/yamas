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
import { ParserOptions } from "../Parser.js";
import { ParserError } from "../ParserError.js";
import * as Nodes from "../nodes/Node.js";
import { NodeType } from "../nodes/Node.js";
import { CommonParser } from "./CommonParser.js";

type BinOpFragment = { elem: Nodes.Element | Nodes.ParenExpr, op?: Tokens.CharToken };

export class ExprParser {
    public constructor(private opts: ParserOptions, private lexer: Lexer, private commonParser: CommonParser) {
    }

    /**
     * Parse expression parts separated by blanks, then either return a single
     * expression or an expression group (e.g. [CLA OSR]).
     * Note that while Symbols are an Element and thus an expression, this function
     * will never return a single Symbol. Instead, it will return an expression group
     * with a symbol and an empty operand array for these situations.
     * This makes it a lot easier to figure out if the first part of an expression is a pseudo, an MRI etc.
     * because all of them will be in an expression group instead of a Symbol, a BinOp or something else.
     * @returns a symbol group or an expression that's not a single symbol
     */
    public parseExpr(gotTok?: Tokens.Token): Nodes.Expression {
        const exprs: Nodes.Expression[] = this.parseExprParts(gotTok);

        if (exprs.length == 1 && exprs[0].type != NodeType.Element) {
            return exprs[0];
        }

        const firstElem = exprs[0];
        const group: Nodes.ExprGroup = {
            type: NodeType.SymbolGroup,
            exprs: exprs,
            extent: calcExtent(firstElem, exprs[exprs.length - 1]),
        };
        return group;
    }

    /**
     * Checks whether token could appear inside an expression
     * @param tok token to examine
     * @returns true if token could be part of an expression
     */
    private couldBeInExpr(tok: Tokens.Token): boolean {
        switch (tok.type) {
            case TokenType.Blank:
            case TokenType.Integer:
            case TokenType.ASCII:
            case TokenType.Symbol:
            case TokenType.Char:
                return true;
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

    private parseExprParts(gotTok?: Tokens.Token): Nodes.Expression[] {
        const exprs: Nodes.Expression[] = [];
        while (true) {
            const tok = this.lexer.nextNonBlank(false, gotTok);
            gotTok = undefined;
            if (!this.couldBeInExpr(tok) || (tok.type == TokenType.Char && [")", "]"].includes(tok.char))) {
                this.lexer.unget(tok);
                if (exprs.length == 0) {
                    throw new ParserError("Expression expected", tok);
                }
                break;
            }
            const expr = this.parseExpressionPart(tok);
            exprs.push(expr);
        }

        return exprs;
    }

    /**
     * Parse a an expression - symbols will be return as such.
     * This function will never return an expression group.
     * On a blank, it will stop parsing and expect the caller to call it again
     * for the next symbol.
     * @returns The next part of an expression
     */
    private parseExpressionPart(gotTok?: Tokens.Token): Nodes.Expression {
        // check for special cases that are not linked with operators
        const first = this.lexer.nextNonBlank(false, gotTok);
        if (first.type == TokenType.Char) {
            if (first.char == "(" || first.char == "[") {
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
        }

        // no special case - must be single element or element with operators
        return this.parseBinOpOrElement(first);
    }

    private parseBinOpOrElement(gotTok?: Tokens.Token): Nodes.BinaryOp | Nodes.Expression {
        // all expressions are left-associative, so collect parts and fold
        const fragments: BinOpFragment[] = [];
        while (true) {
            const first = this.lexer.nextNonBlank(false, gotTok);
            gotTok = undefined;
            if (first.type == TokenType.Char && (first.char == "(" || first.char == "[")) {
                const expr = this.parseExpressionPart(first) as Nodes.ParenExpr;
                fragments.push({ elem: expr });
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

    /**
     * Parse the next element of an expression and the next operator.
     * @returns The next element of an expression and the operator behind it, if any.
     */
    private parseElemAndOp(gotTok?: Tokens.Token): BinOpFragment {
        const firstElem = this.commonParser.parseElement(gotTok);

        const nextTok = this.lexer.next();
        if (!this.couldBeInExpr(nextTok)) {
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
                    case ")":
                    case "]":
                        this.lexer.unget(nextTok);
                        return { elem: firstElem };
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
