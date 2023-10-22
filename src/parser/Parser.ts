import { AstElement, Expression, OriginStatement, AssignStatement, Program, Statement, LabelDef, BinaryOp, BinaryOpChr, ExpressionStatement, SymbolGroup } from "./AST";
import { Token, TokenType, SymbolToken } from "../lexer/Token";
import { Lexer } from "../lexer/Lexer";

type BinOpFragment = {elem: AstElement, op?: BinaryOpChr};

export class Parser {
    private lexer: Lexer;

    public constructor(lexer: Lexer) {
        this.lexer = lexer;
    }

    public run(): Program {
        const prog: Program = {
            type: "program",
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
                type: "exprStmt",
                expr: this.parseExpr(),
            } as ExpressionStatement;
        };

        switch (tok.type) {
            case TokenType.Char:
                switch (tok.char) {
                    case "$": return undefined;
                    case "*": return this.parseOriginStatement(tok);
                    case ";": return {type: "separator", separator: tok.char};
                    case "-": return asExpr();
                    case ".": return asExpr();
                }
                break;
            case TokenType.Text:
                return {
                    type: "text",
                    delim: tok.delim,
                    text: tok.text,
                };
            case TokenType.ASCII:
            case TokenType.Integer:
                return asExpr();
            case TokenType.Symbol:
                const next = this.lexer.next();
                if (next.type == TokenType.Char) {
                    if (next.char == ",") {
                        return this.parseLabelDef(tok);
                    } else if (next.char == "=") {
                        return this.parseParameterDef(tok);
                    }
                }
                this.lexer.unget(next);
                return asExpr();
            case TokenType.Comment:
                return {type: "comment", comment: tok.comment};
            case TokenType.EOL:
                return {type: "separator", separator: "\n"};
            case TokenType.EOF:
                return undefined;
        }
        throw new Error(`Statement expected, got ${JSON.stringify(tok)}`);
    }

    private parseOriginStatement(sym: Token): OriginStatement {
        return {
            type: "origin",
            val: this.parseExpr(),
        };
    }

    private parseLabelDef(sym: SymbolToken): LabelDef {
        return {
            type: "label",
            sym: {
                type: "symbol",
                sym: sym.symbol
            },
        };
    }

    private parseParameterDef(sym: SymbolToken): AssignStatement {
        return {
            type: "param",
            sym: {
                type: "symbol",
                sym: sym.symbol
            },
            val: this.parseExpr(),
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
            throw Error("Expression expected");
        }

        const firstElem = exprs[0];
        if (firstElem.type == "symbol") {
            const group: SymbolGroup = {
                type: "group",
                first: firstElem,
                exprs: exprs.splice(1),
            };
            return group;
        } else {
            if (exprs.length == 1) {
                return exprs[0];
            } else {
                throw Error("Logic error");
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
                    type: "paren",
                    paren: first.char,
                    expr: this.parseExpressionPart(),
                }
            }
        } else if (first.type == TokenType.RawSequence) {
            return {
                type: "unparsed",
                body: first.body,
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
                        return {elem: firstElem, op: nextTok.char};
                    case ")":
                    case "]":
                        return {elem: firstElem};
                    default:
                        throw Error(`Unexpected operator in expression: '${nextTok.char}'`);
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
            throw Error("Unexpected end of expression");
        }

        if (!parts[0].op) {
            throw Error("No operator in first expression part");
        }

        let binOp: BinaryOp = {
            type: "binop",
            lhs: parts[0].elem,
            operator: parts[0].op,
            rhs: parts[1].elem,
        };

        for (let i = 1; i < parts.length - 1; i++) {
            const next = parts[i];
            if (!next.op) {
                throw Error("No operator in expression part");
            }
            binOp = {
                type: "binop",
                lhs: binOp,
                operator: next.op,
                rhs: parts[i + 1].elem,
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
                type: "integer",
                int: tok.value,
            };
        } else if (tok.type == TokenType.Symbol) {
            return {
                type: "symbol",
                sym: tok.symbol,
            };
        } else if (tok.type == TokenType.Char && tok.char == ".") {
            return {
                type: "clc",
            };
        } else if (tok.type == TokenType.Char && tok.char == "-") {
            return {
                type: "unary",
                operator: "-",
                next: this.parseElement(),
            }
        } else if (tok.type == TokenType.ASCII) {
            return {
                type: "ascii",
                char: tok.char,
            };
        } else {
            throw Error(`Element expected, got ${JSON.stringify(tok)}`);
        }
    }
}
