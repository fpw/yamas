import { Lexer } from "../lexer/Lexer";
import * as Tokens from "../lexer/Token";
import * as Nodes from "./Node";

type BinOpFragment = {elem: Nodes.Element, op?: Tokens.CharToken};

export class Parser {
    private lexer: Lexer;
    private macros = new Map<string, Nodes.DefineStatement>();

    public constructor(lexer: Lexer) {
        this.lexer = lexer;
    }

    public parseProgram(): Nodes.Program {
        const prog: Nodes.Program = {
            type: Nodes.NodeType.Program,
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

    private parseStatement(): Nodes.Statement | undefined {
        const tok = this.lexer.nextNonBlank();

        switch (tok.type) {
            case Tokens.TokenType.Char:
                switch (tok.char) {
                    case "*": return this.parseOriginStatement(tok);
                    case "-": return this.finishExprStatement(tok);
                    case ".": return this.finishExprStatement(tok);
                }
                break;
            case Tokens.TokenType.Text:
                return {type: Nodes.NodeType.Text, token: tok};
            case Tokens.TokenType.ASCII:
            case Tokens.TokenType.Integer:
                return this.finishExprStatement(tok);
            case Tokens.TokenType.Symbol:
                return this.finishStatement(tok);
            case Tokens.TokenType.Comment:
                return {type: Nodes.NodeType.Comment, token: tok};
            case Tokens.TokenType.EOL:
                return {type: Nodes.NodeType.Separator, separator: "\n", token: tok};
            case Tokens.TokenType.Separator:
                return {type: Nodes.NodeType.Separator, separator: tok.char, token: tok};
            case Tokens.TokenType.EOF:
                return undefined;
        }
        throw new Error(`Statement expected, got ${Tokens.tokenToString(tok)}`, {cause: tok});
    }

    private finishStatement(startSym: Tokens.SymbolToken): Nodes.Statement {
        if (startSym.symbol == "DEFINE") {
            const def = this.parseDefine(startSym);
            this.macros.set(def.name.token.symbol, def);
            return def;
        } else if (this.macros.has(startSym.symbol)) {
            this.lexer.unget(startSym);
            return this.parseInvocation();
        }

        const next = this.lexer.next();
        if (next.type == Tokens.TokenType.Char) {
            if (next.char == ",") {
                return this.parseLabelDef(startSym, next);
            } else if (next.char == "=") {
                return this.parseParameterDef(startSym, next);
            }
        }
        this.lexer.unget(next);
        return this.finishExprStatement(startSym);
    }

    private finishExprStatement(start: Tokens.Token): Nodes.ExpressionStatement {
        this.lexer.unget(start);
        return {
            type: Nodes.NodeType.ExpressionStmt,
            expr: this.parseExpr(),
        } as Nodes.ExpressionStatement;
    };


    private parseOriginStatement(sym: Tokens.CharToken): Nodes.OriginStatement {
        return {
            type: Nodes.NodeType.Origin,
            token: sym,
            val: this.parseExpr(),
        };
    }

    private parseLabelDef(sym: Tokens.SymbolToken, chr: Tokens.CharToken): Nodes.LabelDef {
        return {
            type: Nodes.NodeType.Label,
            sym: {
                type: Nodes.NodeType.Symbol,
                token: sym,
            },
            token: chr,
        };
    }

    private parseParameterDef(sym: Tokens.SymbolToken, chr: Tokens.CharToken): Nodes.AssignStatement {
        return {
            type: Nodes.NodeType.Assignment,
            sym: {
                type: Nodes.NodeType.Symbol,
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
    private parseExpr(): Nodes.Expression {
        const exprs: Nodes.Expression[] = this.parseExprParts();

        const firstElem = exprs[0];
        if (firstElem.type == Nodes.NodeType.Symbol) {
            const group: Nodes.SymbolGroup = {
                type: Nodes.NodeType.SymbolGroup,
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

    private parseExprParts(): Nodes.Expression[] {
        const exprs: Nodes.Expression[] = [];
        while (true) {
            const tok = this.lexer.nextNonBlank();
            if (!this.couldBeInExpr(tok)) {
                this.lexer.unget(tok);
                if (exprs.length == 0) {
                    throw Error("Expression expected", {cause: tok});
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
        if (first.type == Tokens.TokenType.Char) {
            if (first.char == "(" || first.char == "[") {
                return {
                    type: Nodes.NodeType.ParenExpr,
                    paren: first.char,
                    expr: this.parseExpressionPart(),
                    token: first,
                }
            }
        } else if (first.type == Tokens.TokenType.MacroBody) {
            return {
                type: Nodes.NodeType.MacroBody,
                token: first,
            };
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
        const firstElem = this.parseElement();

        const nextTok = this.lexer.next();
        if (!this.couldBeInExpr(nextTok)) {
            this.lexer.unget(nextTok);
            return {elem: firstElem};
        }

        switch (nextTok.type) {
            case Tokens.TokenType.Char:
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
            default:
                this.lexer.unget(nextTok);
                return {elem: firstElem};
        }
    }

    private foldExpressionParts(parts: BinOpFragment[]): Nodes.BinaryOp {
        if (parts.length < 2) {
            throw Error("Unexpected end of expression", {cause: parts[0].elem});
        }

        if (!parts[0].op) {
            throw Error("No operator in first expression part", {cause: parts[0].elem});
        }

        let binOp: Nodes.BinaryOp = {
            type: Nodes.NodeType.BinaryOp,
            lhs: parts[0].elem,
            operator: parts[0].op.char as Tokens.BinaryOpChr,
            rhs: parts[1].elem,
            token: parts[0].op,
        };

        for (let i = 1; i < parts.length - 1; i++) {
            const next = parts[i];
            if (!next.op) {
                throw Error("No operator in expression part", {cause: next.elem});
            }
            binOp = {
                type: Nodes.NodeType.BinaryOp,
                lhs: binOp,
                operator: next.op.char as Tokens.BinaryOpChr,
                rhs: parts[i + 1].elem,
                token: next.op,
            };
        }

        return binOp;
    }

    /**
     * Checks whether token could appear inside an expression
     * @param tok token to examine
     * @returns true if token could be part of an expression
     */
    private couldBeInExpr(tok: Tokens.Token): boolean {
        switch (tok.type) {
            case Tokens.TokenType.Blank:
            case Tokens.TokenType.Integer:
            case Tokens.TokenType.ASCII:
            case Tokens.TokenType.Symbol:
            case Tokens.TokenType.MacroBody:
            case Tokens.TokenType.Char:
                return true;
            case Tokens.TokenType.Comment:
            case Tokens.TokenType.Text:
            case Tokens.TokenType.Separator:
            case Tokens.TokenType.EOF:
            case Tokens.TokenType.EOL:
                return false;
        }
    }

    private parseElement(): Nodes.Element {
        const tok = this.lexer.nextNonBlank();

        switch (tok.type) {
            case Tokens.TokenType.ASCII:   return {type: Nodes.NodeType.ASCIIChar, token: tok};
            case Tokens.TokenType.Symbol:  return {type: Nodes.NodeType.Symbol, token: tok};
            case Tokens.TokenType.Integer: return {type: Nodes.NodeType.Integer, token: tok};
            case Tokens.TokenType.Char:
                if (tok.char == ".") {
                    return {
                        type: Nodes.NodeType.CLCValue,
                        token: tok,
                    };
                } else if (tok.char == "-") {
                    return {
                        type: Nodes.NodeType.UnaryOp,
                        operator: "-",
                        elem: this.parseElement(),
                        token: tok,
                    }
                }
                break;
        }
        throw Error(`Element expected, got ${Tokens.tokenToString(tok)}`, {cause: tok});
    }

    private parseDefine(token: Tokens.SymbolToken): Nodes.DefineStatement {
        const nameElem = this.parseElement();
        if (nameElem.type != Nodes.NodeType.Symbol) {
            throw Error("Invalid DEFINE syntax: Expecting symbol", {cause: nameElem});
        }

        const name = nameElem;
        const params: Nodes.SymbolNode[] = [];
        let body: Nodes.MacroBody | undefined;

        while (true) {
            const next = this.parseExpressionPart();
            if (next.type == Nodes.NodeType.Symbol) {
                params.push(next);
            } else if (next.type == Nodes.NodeType.MacroBody) {
                body = next;
                break;
            } else {
                throw Error("Invalid DEFINE syntax: Expecting symbols and body", {cause: next});
            }
        }

        return {
            type: Nodes.NodeType.Define, name, body, params: params, token
        };
    }

    private parseInvocation(): Nodes.Invocation {
        const nameSym = this.parseElement();
        if (!nameSym || nameSym.type != Nodes.NodeType.Symbol) {
            throw Error("Invalid invocation", {cause: nameSym});
        }

        const macro = this.macros.get(nameSym.token.symbol);
        if (!macro) {
            throw Error("Not a macro", {cause: nameSym});
        }

        const args: Tokens.MacroBodyToken[] = [];
        for (let i = 0; i < macro.params.length; i++) {
            const arg = this.lexer.nextMacroArgument();
            args.push(arg);
        }

        const next = this.lexer.nextNonBlank();
        if (this.couldBeInExpr(next)) {
            throw Error("Excessive argument for macro", {cause: next});
        }
        this.lexer.unget(next);

        return {
            type: Nodes.NodeType.Invocation,
            name: nameSym,
            args: args,
            program: this.createMacroProgram(macro, args),
        };
    }

    private createMacroProgram(macro: Nodes.DefineStatement, args: Tokens.MacroBodyToken[]): Nodes.Program {
        const macroLexer = new Lexer();
        macroLexer.addInput(macro.name.token.symbol + ".macro", macro.body.token.body);
        for (let i = 0; i < args.length; i++) {
            macroLexer.addSubstitution(macro.params[i].token.symbol, args[i].body);
        }

        const macroParser = new Parser(macroLexer);
        return macroParser.parseProgram();
    }
}
