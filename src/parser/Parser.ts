import { AstElement, Expression, OriginStatement, AssignStatement, Program, Statement, LabelDef, BinaryOp, BinaryOpChr } from "./AST";
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

        switch (tok.type) {
            case TokenType.Char:
                switch (tok.char) {
                    case "*":
                        return this.parseOriginStatement(tok);
                    case ";":
                        return {type: "separator", separator: tok.char};
                    case ".":
                        this.lexer.unget(tok);
                        return {
                            type: "exprStmt",
                            expr: this.parseExpr(),
                        };
                }
                break;
            case TokenType.Integer:
                this.lexer.unget(tok);
                return {
                    type: "exprStmt",
                    expr: this.parseExpr(),
                };
            case TokenType.Symbol:
                switch (this.lexer.peekNext()) {
                    case ",":
                        return this.parseLabelDef(tok);
                    case "=":
                        return this.parseParameterDef(tok);
                    default:
                        this.lexer.unget(tok);
                        return {
                            type: "exprStmt",
                            expr: this.parseExpr(),
                        };
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
        const first = this.lexer.next(false);
        if (first.type == TokenType.Char) {
            if (first.char == "(" || first.char == "[") {
                return {
                    type: "paren",
                    paren: first.char,
                    expr: this.parseExpr(),
                }
            }
        } else if (first.type == TokenType.RawSequence) {
            return {
                type: "unparsed",
                body: first.body,
            };
        }
        this.lexer.unget(first);

        const elem = this.parseElement();

        // no spaces allowed around operators, except operator is space
        let next = this.lexer.next(true);

        if (this.isEndOfExpr(next)) {
            this.lexer.unget(next);
            return elem;
        }

        let opr: BinaryOpChr;
        switch (next.type) {
            case TokenType.Char:
                switch (next.char) {
                    case "+":
                    case "-":
                    case "^":
                    case "%":
                    case "!":
                    case "&":
                        opr = next.char;
                        break;
                    case ")":
                    case "]":
                        opr = " ";
                        break;
                    default:
                        throw Error(`Unexpected operator in expression: '${next.char}'`);
                }
                break;
            case TokenType.Blank:
                opr = " ";
                break;
            default:
                throw Error(`Unexpected token in operator: ${JSON.stringify(next)}`);
        }

        if (opr == " ") {
            // check if there is actually more
            next = this.lexer.next(false);
            if (this.isEndOfExpr(next)) {
                this.lexer.unget(next);
                return elem;
            }
            this.lexer.unget(next);
        }

        const expr: BinaryOp = {
            type: "binop",
            lhs: elem,
            operator: opr,
            rhs: this.parseExpr(),
        }

        return expr;
    }

    private isEndOfExpr(tok: Token): boolean {
        switch (tok.type) {
            case TokenType.Blank:
            case TokenType.Integer:
            case TokenType.Symbol:
            case TokenType.RawSequence:
                return false;
            case TokenType.Comment:
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
        } else {
            throw Error(`Element expected, got ${JSON.stringify(tok)}`);
        }
    }
}
