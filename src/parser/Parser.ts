import { Lexer } from "../lexer/Lexer";
import { CharToken, RawSequenceToken, SymbolToken, Token, TokenType, tokenToString } from "../lexer/Token";
import {
    AssignStatement, AstElement, NodeType, AstSymbol, BinaryOp, BinaryOpChr, DefineStatement, Expression,
    ExpressionStatement, Invocation, LabelDef, OriginStatement, Program,
    Statement, SymbolGroup, UnparsedSequence
} from "./ASTNode";

type BinOpFragment = {elem: AstElement, op?: CharToken};

export class Parser {
    private lexer: Lexer;
    private macros = new Map<string, DefineStatement>();

    public constructor(lexer: Lexer) {
        this.lexer = lexer;
    }

    public parseProgram(): Program {
        const prog: Program = {
            type: NodeType.Program,
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
                type: NodeType.ExpressionStmt,
                expr: this.parseExpr(),
            } as ExpressionStatement;
        };

        switch (tok.type) {
            case TokenType.Char:
                switch (tok.char) {
                    case "$": return undefined;
                    case "*": return this.parseOriginStatement(tok);
                    case ";": return {type: NodeType.Separator, separator: tok.char, token: tok};
                    case "-": return asExpr();
                    case ".": return asExpr();
                }
                break;
            case TokenType.Text:
                return {
                    type: NodeType.Text,
                    token: tok,
                };
            case TokenType.ASCII:
            case TokenType.Integer:
                return asExpr();
            case TokenType.Symbol:
                if (tok.symbol == "DEFINE") {
                    const def = this.parseDefine(tok);
                    this.macros.set(def.name.token.symbol, def);
                    return def;
                } else if (this.macros.has(tok.symbol)) {
                    this.lexer.unget(tok);
                    return this.parseInvocation();
                }
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
                return {type: NodeType.Comment, token: tok};
            case TokenType.EOL:
                return {type: NodeType.Separator, separator: "\n", token: tok};
            case TokenType.EOF:
                return undefined;
        }
        throw new Error(`Statement expected, got ${tokenToString(tok)}`, {cause: tok});
    }

    private parseOriginStatement(sym: CharToken): OriginStatement {
        return {
            type: NodeType.Origin,
            token: sym,
            val: this.parseExpr(),
        };
    }

    private parseLabelDef(sym: SymbolToken, chr: CharToken): LabelDef {
        return {
            type: NodeType.Label,
            sym: {
                type: NodeType.Symbol,
                token: sym,
            },
            token: chr,
        };
    }

    private parseParameterDef(sym: SymbolToken, chr: CharToken): AssignStatement {
        return {
            type: NodeType.Assignment,
            sym: {
                type: NodeType.Symbol,
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
        if (firstElem.type == NodeType.Symbol) {
            const group: SymbolGroup = {
                type: NodeType.SymbolGroup,
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
                    type: NodeType.ParenExpr,
                    paren: first.char,
                    expr: this.parseExpressionPart(),
                    token: first,
                }
            }
        } else if (first.type == TokenType.RawSequence) {
            return {
                type: NodeType.UnparsedSequence,
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
            type: NodeType.BinaryOp,
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
                type: NodeType.BinaryOp,
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
                type: NodeType.Integer,
                token: tok,
            };
        } else if (tok.type == TokenType.Symbol) {
            return {
                type: NodeType.Symbol,
                token: tok,
            };
        } else if (tok.type == TokenType.Char && tok.char == ".") {
            return {
                type: NodeType.CLCValue,
                token: tok,
            };
        } else if (tok.type == TokenType.Char && tok.char == "-") {
            return {
                type: NodeType.UnaryOp,
                operator: "-",
                next: this.parseElement(),
                token: tok,
            }
        } else if (tok.type == TokenType.ASCII) {
            return {
                type: NodeType.ASCIIChar,
                token: tok,
            };
        } else {
            throw Error(`Element expected, got ${tokenToString(tok)}`, {cause: tok});
        }
    }

    private parseDefine(token: SymbolToken): DefineStatement {
        const nameElem = this.parseElement();
        if (nameElem.type != NodeType.Symbol) {
            throw Error("Invalid DEFINE syntax: Expecting symbol", {cause: nameElem});
        }

        const name = nameElem;
        const params: AstSymbol[] = [];
        let body: UnparsedSequence | undefined;

        while (true) {
            const next = this.parseExpressionPart();
            if (next.type == NodeType.Symbol) {
                params.push(next);
            } else if (next.type == NodeType.UnparsedSequence) {
                body = next;
                break;
            } else {
                throw Error("Invalid DEFINE syntax: Expecting symbols and body", {cause: next});
            }
        }

        return {
            type: NodeType.Define, name, body, params: params, token
        };
    }

    private parseInvocation(): Invocation {
        const nameSym = this.parseElement();
        if (!nameSym || nameSym.type != NodeType.Symbol) {
            throw Error("Invalid invocation", {cause: nameSym});
        }

        const macro = this.macros.get(nameSym.token.symbol);
        if (!macro) {
            throw Error("Not a macro", {cause: nameSym});
        }

        const args: RawSequenceToken[] = [];
        for (let i = 0; i < macro.params.length; i++) {
            const arg = this.lexer.nextMacroArgument();
            args.push(arg);
        }

        const next = this.lexer.nextNonBlank();
        if (!this.isEndOfExpr(next)) {
            throw Error("Excessive argument for macro", {cause: next});
        }
        this.lexer.unget(next);

        return {
            type: NodeType.Invocation,
            name: nameSym,
            args: args,
            program: this.createMacroProgram(macro, args),
        };
    }

    private createMacroProgram(macro: DefineStatement, args: RawSequenceToken[]): Program {
        const macroLexer = new Lexer();
        macroLexer.addInput(macro.name.token.symbol + ".macro", macro.body.token.body);
        for (let i = 0; i < args.length; i++) {
            macroLexer.addSubstitution(macro.params[i].token.symbol, args[i].body);
        }

        const macroParser = new Parser(macroLexer);
        return macroParser.parseProgram();
    }
}
