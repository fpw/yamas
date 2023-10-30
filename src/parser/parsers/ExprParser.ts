import { Lexer } from "../../lexer/Lexer";
import * as Tokens from "../../lexer/Token";
import { TokenType } from "../../lexer/Token";
import { LeafParser } from "./LeafParser";
import * as Nodes from "../Node";
import { NodeType } from "../Node";
import { Parser } from "../Parser";

type BinOpFragment = { elem: Nodes.Element, op?: Tokens.CharToken };

export class ExprParser {
    public constructor(private lexer: Lexer, private leafParser: LeafParser) {
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
    public parseExpr(): Nodes.Expression {
        const exprs: Nodes.Expression[] = this.parseExprParts();

        const firstElem = exprs[0];
        if (firstElem.type == NodeType.Symbol) {
            const group: Nodes.SymbolGroup = {
                type: NodeType.SymbolGroup,
                first: firstElem,
                exprs: exprs.splice(1),
            };
            return group;
        } else {
            if (exprs.length == 1) {
                return exprs[0];
            } else {
                throw Parser.mkNodeError("Logic error: Group not started by symbol", firstElem);
            }
        }
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

    private parseExprParts(): Nodes.Expression[] {
        const exprs: Nodes.Expression[] = [];
        while (true) {
            const tok = this.lexer.nextNonBlank();
            if (!this.couldBeInExpr(tok)) {
                this.lexer.unget(tok);
                if (exprs.length == 0) {
                    throw Parser.mkTokError("Expression expected", tok);
                }
                break;
            }
            this.lexer.unget(tok);
            const expr = this.parseExpressionPart();
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
    private parseExpressionPart(): Nodes.Expression {
        // check for special cases that are not linked with operators
        const first = this.lexer.nextNonBlank();
        if (first.type == TokenType.Char) {
            if (first.char == "(" || first.char == "[") {
                const afterParen = this.lexer.nextNonBlank();
                this.lexer.unget(afterParen);
                let expr: Nodes.Expression;
                if (afterParen.type == TokenType.Symbol) {
                    // starts with symbol -> could be group, e.g. (TAD I 1234)
                    expr = this.parseExpr();
                } else {
                    // starts with something else -> don't try as group, e.g. (-CDF 0)
                    expr = this.parseExpressionPart();
                }
                return {
                    type: NodeType.ParenExpr,
                    paren: first.char,
                    expr: expr,
                    token: first,
                };
            }
        }

        // no special case - must be single element or element with operators
        this.lexer.unget(first);
        return this.parseBinOpOrElement();
    }

    private parseBinOpOrElement(): Nodes.BinaryOp | Nodes.Element {
        // all expressions are left-associative, so collect parts and fold
        const parts: BinOpFragment[] = [];
        while (true) {
            const part = this.parseElementAndOperator();
            parts.push(part);
            if (!part.op) {
                break;
            }
        }

        if (parts.length == 1) {
            return parts[0].elem;
        }

        return this.foldExpressionParts(parts);
    }

    /**
     * Parse the next element of an expression and the next operator.
     * @returns The next element of an expression and the operator behind it, if any.
     */
    private parseElementAndOperator(): BinOpFragment {
        const firstElem = this.leafParser.parseElement();

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
                        return { elem: firstElem };
                    default:
                        throw Parser.mkTokError(`Unexpected operator in expression: '${nextTok.char}'`, nextTok);
                }
            default:
                this.lexer.unget(nextTok);
                return { elem: firstElem };
        }
    }

    // convert a list of (element, operator) tuples to left-associative expression tree
    private foldExpressionParts(parts: BinOpFragment[]): Nodes.BinaryOp {
        if (parts.length < 2) {
            throw Parser.mkNodeError("Unexpected end of expression", parts[0].elem);
        }

        if (!parts[0].op) {
            throw Parser.mkNodeError("No operator in first expression part", parts[0].elem);
        }

        let binOp: Nodes.BinaryOp = {
            type: NodeType.BinaryOp,
            lhs: parts[0].elem,
            operator: parts[0].op.char as Tokens.BinaryOpChr,
            rhs: parts[1].elem,
            token: parts[0].op,
        };

        for (let i = 1; i < parts.length - 1; i++) {
            const next = parts[i];
            if (!next.op) {
                throw Parser.mkNodeError("No operator in expression part", next.elem);
            }
            binOp = {
                type: NodeType.BinaryOp,
                lhs: binOp,
                operator: next.op.char as Tokens.BinaryOpChr,
                rhs: parts[i + 1].elem,
                token: next.op,
            };
        }

        return binOp;
    }

}