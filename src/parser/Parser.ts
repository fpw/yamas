import { AstElement, Expression, OriginStatement, AssignStatement, Program, Statement, LabelDef, BinaryOp, BinaryOpChr, ExpressionStatement, SymbolGroup, AstNodeType } from "./ASTNode";
import { Token, TokenType, SymbolToken, CharToken, tokenToString } from "../lexer/Token";
import { Lexer } from "../lexer/Lexer";

type BinOpFragment = {elem: AstElement, op?: CharToken};

export class Parser {
    private lexer: Lexer;

    public constructor(lexer: Lexer) {
        this.lexer = lexer;
    }

    public run(): Program {
        const prog: Program = {
            type: AstNodeType.Program,
            stmts: [],
        };

        while (true) {
            const stmt = this.parseStatement();
            if (!stmt) {
                break;
            }

            prog.stmts.push(stmt);
        };

        return prog;
    }

    private parseStatement(): Statement | undefined {
        const tok = this.lexer.nextNonBlank();

        const asExpr = () => {
            this.lexer.unget(tok);
            return {
                type: AstNodeType.ExpressionStmt,
                expr: this.parseExpr(),
            } as ExpressionStatement;
        };

        switch (tok.type) {
            case TokenType.Char:
                switch (tok.char) {
                    case "$": return undefined;
                    case "*": return this.parseOriginStatement(tok);
                    case ";": return {type: AstNodeType.Separator, separator: tok.char, token: tok};
                    case "-": return asExpr();
                    case ".": return asExpr();
                }
                break;
            case TokenType.Text:
                return {
                    type: AstNodeType.Text,
                    token: tok,
                };
            case TokenType.ASCII:
            case TokenType.Integer:
                return asExpr();
            case TokenType.Symbol:
                const next = this.lexer.next();
                if (next.type == TokenType.Char) {
                    if (next.char == ",") {
                        return this.parseLabelDef(tok, next);
                    } else if (next.char == "=") {
                        return this.parseParameterDef(tok, next);
                    }
                }
                this.lexer.unget(next);
                return asExpr();
            case TokenType.Comment:
                return {type: AstNodeType.Comment, token: tok};
            case TokenType.EOL:
                return {type: AstNodeType.Separator, separator: "\n", token: tok};
            case TokenType.EOF:
                return undefined;
        }
        throw new Error(`Statement expected, got ${tokenToString(tok)}`, {cause: tok});
    }

    private parseOriginStatement(sym: CharToken): OriginStatement {
        return {
            type: AstNodeType.Origin,
            token: sym,
            val: this.parseExpr(),
        };
    }

    private parseLabelDef(sym: SymbolToken, chr: CharToken): LabelDef {
        return {
            type: AstNodeType.Label,
            sym: {
                type: AstNodeType.Symbol,
                token: sym,
            },
            token: chr,
        };
    }

    private parseParameterDef(sym: SymbolToken, chr: CharToken): AssignStatement {
        return {
            type: AstNodeType.Assignment,
            sym: {
                type: AstNodeType.Symbol,
                token: sym,
            },
            val: this.parseExpr(),
            token: chr,
        };
    }

    /**
     * Parse expression parts separated by blanks, then either return a single
     * expression or an expression group (e.g. [CLA, OSR]).
     * Note that while Symbols are an AstElement and thus an expression, this function
     * will never return a single Symbol. Instead, it will return an expression group
     * with a symbol and an empty operand array.
     * This makes it a lot easier to figure out if the first part of an expression is a pseudo, an MRI etc.
     * because all of them will be in an expression group instead of a Symbol, a BinOp or something else.
     * @returns a symbol group or an expression that's not a single symbol
     */
    private parseExpr(): Expression {
        const exprs: Expression[] = [];

        while (true) {
            const tok = this.lexer.nextNonBlank();
            if (this.isEndOfExpr(tok)) {
                this.lexer.unget(tok);
                break;
            }
            this.lexer.unget(tok);
            const expr = this.parseExpressionPart();
            exprs.push(expr);
        }

        if (exprs.length == 0) {
            throw Error("Expression expected", {cause: this.lexer.getCursor()});
        }

        const firstElem = exprs[0];
        if (firstElem.type == AstNodeType.Symbol) {
            const group: SymbolGroup = {
                type: AstNodeType.SymbolGroup,
                first: firstElem,
                exprs: exprs.splice(1),
            };
            return group;
        } else {
            if (exprs.length == 1) {
                return exprs[0];
            } else {
                throw Error("Logic error: Group not started by symbol", {cause: firstElem});
            }
        }
    }

    /**
     * Parse a an expression - symbols will be return as such.
     * This function will never return an expression group.
     * On a blank, it will stop parsing and expect the caller to call it again
     * for the next symbol.
     * @returns The next part of an expression
     */
    private parseExpressionPart(): Expression {
        const first = this.lexer.nextNonBlank();
        if (first.type == TokenType.Char) {
            if (first.char == "(" || first.char == "[") {
                return {
                    type: AstNodeType.ParenExpr,
                    paren: first.char,
                    expr: this.parseExpressionPart(),
                    token: first,
                }
            }
        } else if (first.type == TokenType.RawSequence) {
            return {
                type: AstNodeType.UnparsedSequence,
                token: first,
            };
        }
        this.lexer.unget(first);

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
        const firstElem = this.parseElement();
        const nextTok = this.lexer.next();

        if (this.isEndOfExpr(nextTok)) {
            this.lexer.unget(nextTok);
            return {elem: firstElem};
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
                        return {elem: firstElem, op: nextTok};
                    case ")":
                    case "]":
                        return {elem: firstElem};
                    default:
                        throw Error(`Unexpected operator in expression: '${nextTok.char}'`, {cause: nextTok});
                }
            case TokenType.Comment:
            case TokenType.RawSequence:
            case TokenType.ASCII:
                this.lexer.unget(nextTok);
                return {elem: firstElem};
            default:
                return {elem: firstElem};
        }
    }

    private foldExpressionParts(parts: BinOpFragment[]): BinaryOp {
        if (parts.length < 2) {
            throw Error("Unexpected end of expression", {cause: parts[0].elem});
        }

        if (!parts[0].op) {
            throw Error("No operator in first expression part", {cause: parts[0].elem});
        }

        let binOp: BinaryOp = {
            type: AstNodeType.BinaryOp,
            lhs: parts[0].elem,
            operator: parts[0].op.char as BinaryOpChr,
            rhs: parts[1].elem,
            token: parts[0].op,
        };

        for (let i = 1; i < parts.length - 1; i++) {
            const next = parts[i];
            if (!next.op) {
                throw Error("No operator in expression part", {cause: next.elem});
            }
            binOp = {
                type: AstNodeType.BinaryOp,
                lhs: binOp,
                operator: next.op.char as BinaryOpChr,
                rhs: parts[i + 1].elem,
                token: next.op,
            };
        }

        return binOp;
    }

    private isEndOfExpr(tok: Token): boolean {
        switch (tok.type) {
            case TokenType.Blank:
            case TokenType.Integer:
            case TokenType.ASCII:
            case TokenType.Symbol:
            case TokenType.RawSequence:
                return false;
            case TokenType.Comment:
            case TokenType.Text:
            case TokenType.EOF:
            case TokenType.EOL:
                return true;
            case TokenType.Char:
                if (tok.char == ";") {
                    return true;
                }
                return false;
        }
    }

    private parseElement(): AstElement {
        const tok = this.lexer.nextNonBlank();

        if (tok.type == TokenType.Integer) {
            return {
                type: AstNodeType.Integer,
                token: tok,
            };
        } else if (tok.type == TokenType.Symbol) {
            return {
                type: AstNodeType.Symbol,
                token: tok,
            };
        } else if (tok.type == TokenType.Char && tok.char == ".") {
            return {
                type: AstNodeType.CLCValue,
                token: tok,
            };
        } else if (tok.type == TokenType.Char && tok.char == "-") {
            return {
                type: AstNodeType.UnaryOp,
                operator: "-",
                next: this.parseElement(),
                token: tok,
            }
        } else if (tok.type == TokenType.ASCII) {
            return {
                type: AstNodeType.ASCIIChar,
                token: tok,
            };
        } else {
            throw Error(`Element expected, got ${tokenToString(tok)}`, {cause: tok});
        }
    }
}
