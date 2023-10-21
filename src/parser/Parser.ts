import { AstElement, Expression, OriginStatement, AssignStatement, Program, Statement, LabelDef, BinaryOp, BinaryOpChr, ExpressionStatement, SymbolGroup } from "./AST";
import { Token, TokenType, SymbolToken } from "../lexer/Token";
import { Lexer } from "../lexer/Lexer";

export class Parser {
    private lexer: Lexer;

    public constructor(lexer: Lexer) {
        this.lexer = lexer;
    }

    public parseProgram(): Program {
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
        const tok = this.lexer.next(false);

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
                    case "$":
                        return undefined;
                    case "*":
                        return this.parseOriginStatement(tok);
                    case ";":
                        return {type: "separator", separator: tok.char};
                    case "-":
                    case ".":
                        return asExpr();
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
                switch (this.lexer.peekNext()) {
                    case ",":
                        return this.parseLabelDef(tok);
                    case "=":
                        return this.parseParameterDef(tok);
                    default:
                        return asExpr();
                }
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
        this.lexer.skipChar(",");

        return {
            type: "label",
            sym: {
                type: "symbol",
                sym: sym.symbol
            },
        };
    }

    private parseParameterDef(sym: SymbolToken): AssignStatement {
        this.lexer.skipChar("=");

        return {
            type: "param",
            sym: {
                type: "symbol",
                sym: sym.symbol
            },
            val: this.parseExpr(),
        };
    }

    private parseExpr(): Expression {
        const exprs: Expression[] = [];

        while (true) {
            const tok = this.lexer.next(false);
            if (this.isEndOfExpr(tok)) {
                this.lexer.unget(tok);
                break;
            }
            this.lexer.unget(tok);
            const expr = this.parseExprNoGroup();
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

    private parseExprNoGroup(): Expression {
        const first = this.lexer.next(false);
        if (first.type == TokenType.Char) {
            if (first.char == "(" || first.char == "[") {
                return {
                    type: "paren",
                    paren: first.char,
                    expr: this.parseExprNoGroup(),
                }
            }
        } else if (first.type == TokenType.RawSequence) {
            return {
                type: "unparsed",
                body: first.body,
            };
        }
        this.lexer.unget(first);

        const firstElem = this.parseElement();
        const nextTok = this.lexer.next(true);

        if (this.isEndOfExpr(nextTok)) {
            this.lexer.unget(nextTok);
            return firstElem;
        }

        let opr: BinaryOpChr;
        switch (nextTok.type) {
            case TokenType.Char:
                switch (nextTok.char) {
                    case "+":
                    case "-":
                    case "^":
                    case "%":
                    case "!":
                    case "&":
                        opr = nextTok.char;
                        break;
                    case ")":
                    case "]":
                        return firstElem;
                    default:
                        throw Error(`Unexpected operator in expression: '${nextTok.char}'`);
                }
                break;
            case TokenType.Blank:
                return firstElem;
            default:
                throw Error(`Unexpected token in operator: ${JSON.stringify(nextTok)}`);
        }

        const expr: BinaryOp = {
            type: "binop",
            lhs: firstElem,
            operator: opr,
            rhs: this.parseExprNoGroup(),
        }

        return expr;
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
        const tok = this.lexer.next(false);

        if (tok.type == TokenType.Integer) {
            return {
                type: "integer",
                int: tok.value
            };
        } else if (tok.type == TokenType.Symbol) {
            return {
                type: "symbol",
                sym: tok.symbol
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
