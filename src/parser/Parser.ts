import { CodeError } from "../utils/CodeError";
import { Lexer } from "../lexer/Lexer";
import * as Tokens from "../lexer/Token";
import * as Nodes from "./Node";

type BinOpFragment = {elem: Nodes.Element, op?: Tokens.CharToken};

export class Parser {
    private keywords = new Set([
        "TEXT",
        "DEFINE",
        "DUBL", "FLTG",
        "EJECT",
        "FIXMRI",
    ]);
    private inputName: string;
    private lexer: Lexer;
    private macros = new Map<string, Nodes.DefineStatement>();

    public constructor(inputName: string, input: string) {
        this.inputName = inputName;
        this.lexer = new Lexer(inputName, input);
    }

    public parseProgram(): Nodes.Program {
        const prog: Nodes.Program = {
            type: Nodes.NodeType.Program,
            inputName: this.inputName,
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
                    case "+": return this.finishExprStatement(tok);
                    case ".": return this.finishExprStatement(tok);
                }
                break;
            case Tokens.TokenType.ASCII:
            case Tokens.TokenType.Integer:
                return this.finishExprStatement(tok);
            case Tokens.TokenType.Symbol:
                return this.finishStatement(tok);
            case Tokens.TokenType.Comment:
                return this.parseComment(tok);
            case Tokens.TokenType.EOL:
            case Tokens.TokenType.Separator:
                return this.parseSeparator(tok);
            case Tokens.TokenType.EOF:
                return undefined;
        }
        throw Parser.mkTokError(`Statement expected, got ${Tokens.tokenToString(tok)}`, tok);
    }

    private parseSeparator(tok: Tokens.EOLToken | Tokens.SeparatorToken): Nodes.StatementSeparator {
        if (tok.type == Tokens.TokenType.EOL) {
            return { type: Nodes.NodeType.Separator, separator: "\n", token: tok };
        } else {
            return {type: Nodes.NodeType.Separator, separator: tok.char, token: tok};
        }
    }

    private parseComment(tok: Tokens.CommentToken): Nodes.Comment {
        return { type: Nodes.NodeType.Comment, token: tok };
    }

    private finishStatement(startSym: Tokens.SymbolToken): Nodes.Statement {
        if (this.keywords.has(startSym.symbol)) {
            return this.parseKeyword(startSym);
        } else if (this.macros.has(startSym.symbol)) {
            this.lexer.unget(startSym);
            return this.parseInvocation();
        }

        const next = this.lexer.next();
        if (next.type == Tokens.TokenType.Char) {
            if (next.char == ",") {
                return this.parseLabelDef(startSym, next);
            } else if (next.char == "=") {
                return this.parseAssignment(startSym, next);
            }
        }
        this.lexer.unget(next);
        return this.finishExprStatement(startSym);
    }

    // eslint-disable-next-line max-lines-per-function
    private parseKeyword(startSym: Tokens.SymbolToken): Nodes.Statement {
        switch (startSym.symbol) {
            case "DEFINE":
                const def = this.parseDefine(startSym);
                this.macros.set(def.name.token.symbol, def);
                return def;
            case "TEXT":
                const next = this.lexer.next();
                if (next.type != Tokens.TokenType.Blank) {
                    const got = Tokens.tokenToString(next);
                    throw Parser.mkTokError(`Syntax error in TEXT: Expected blank, got ${got}`, next);
                }
                const [str, delimChr] = this.lexer.nextStringLiteral(true);
                return {type: Nodes.NodeType.Text, token: str, delim: delimChr};
            case "DUBL":
                return this.parseDublList(startSym);
            case "FLTG":
                return this.parseFltgList(startSym);
            case "EJECT":
                const blank = this.lexer.next();
                if (blank.type != Tokens.TokenType.Blank) {
                    const got = Tokens.tokenToString(blank);
                    throw Parser.mkTokError(`Syntax error in EJECT: Expected blank, got ${got}`, blank);
                }
                const [text, _] = this.lexer.nextStringLiteral(false);
                return {type: Nodes.NodeType.Eject, token: text};
            case "FIXMRI":
                return this.parseFixMri(startSym);
            default:
                throw Parser.mkTokError(`Unhandled keyword ${startSym.symbol}`, startSym);
        }
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

    private parseAssignment(sym: Tokens.SymbolToken, chr: Tokens.CharToken): Nodes.AssignStatement {
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

    private parseFixMri(startSym: Tokens.SymbolToken): Nodes.FixMriStatement {
        const nextSym = this.lexer.nextNonBlank();
        if (nextSym.type == Tokens.TokenType.Symbol) {
            const assign = this.finishStatement(nextSym);
            if (assign.type == Nodes.NodeType.Assignment) {
                return { type: Nodes.NodeType.FixMri, assignment: assign, token: startSym };
            }
        }
        throw Parser.mkTokError("FIXMRI must be followed by assignment statement", nextSym);
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
                exprs.forEach(e => console.log(Nodes.formatSingle(e)));
                throw Parser.mkNodeError("Logic error: Group not started by symbol", firstElem);
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
        if (first.type == Tokens.TokenType.Char) {
            if (first.char == "(" || first.char == "[") {
                const afterParen = this.lexer.nextNonBlank();
                this.lexer.unget(afterParen);
                let expr: Nodes.Expression;
                if (afterParen.type == Tokens.TokenType.Symbol) {
                    // starts with symbol -> could be group, e.g. (TAD I 1234)
                    expr = this.parseExpr();
                } else {
                    // starts with something else -> don't try as group, e.g. (-CDF 0)
                    expr = this.parseExpressionPart();
                }
                return {
                    type: Nodes.NodeType.ParenExpr,
                    paren: first.char,
                    expr: expr,
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
                        throw Parser.mkTokError(`Unexpected operator in expression: '${nextTok.char}'`, nextTok);
                }
            default:
                this.lexer.unget(nextTok);
                return {elem: firstElem};
        }
    }

    private foldExpressionParts(parts: BinOpFragment[]): Nodes.BinaryOp {
        if (parts.length < 2) {
            throw Parser.mkNodeError("Unexpected end of expression", parts[0].elem);
        }

        if (!parts[0].op) {
            throw Parser.mkNodeError("No operator in first expression part", parts[0].elem);
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
                throw Parser.mkNodeError("No operator in expression part", next.elem);
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
            case Tokens.TokenType.String:
            case Tokens.TokenType.Separator:
            case Tokens.TokenType.Float:
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
            case Tokens.TokenType.Integer: return this.parseInteger(tok);
            case Tokens.TokenType.Char:
                if (tok.char == ".") {
                    return {
                        type: Nodes.NodeType.CLCValue,
                        token: tok,
                    };
                } else if (tok.char == "-" || tok.char == "+") {
                    return {
                        type: Nodes.NodeType.UnaryOp,
                        operator: tok.char,
                        elem: this.parseElement(),
                        token: tok,
                    }
                }
                break;
        }
        throw Parser.mkTokError(`Element expected, got ${Tokens.tokenToString(tok)}`, tok);
    }

    private parseInteger(tok: Tokens.IntegerToken): Nodes.Integer {
        return { type: Nodes.NodeType.Integer, token: tok };
    }

    private parseDublList(dublSym: Tokens.SymbolToken): Nodes.DoubleIntList {
        const list: Nodes.DublListMember[] = [];

        while (true) {
            const dubl = this.parseDubl();
            if (dubl) {
                list.push(dubl);
            } else {
                break;
            }
        }

        return {
            type: Nodes.NodeType.DoubleIntList,
            list: list,
            token: dublSym,
        };
    }

    private parseDubl(): Nodes.DublListMember | undefined {
        const next = this.lexer.nextNonBlank();
        switch (next.type) {
            case Tokens.TokenType.Comment:
                return this.parseComment(next);
            case Tokens.TokenType.Separator:
            case Tokens.TokenType.EOL:
                return this.parseSeparator(next);
            case Tokens.TokenType.Integer:
                return {type: Nodes.NodeType.DoubleInt, token: next};
            case Tokens.TokenType.Char:
                if (next.char == "+" || next.char == "-") {
                    const nextInt = this.lexer.next();
                    if (nextInt.type != Tokens.TokenType.Integer) {
                        throw Parser.mkTokError("Unexpected unary operand", nextInt);
                    }
                    return { type: Nodes.NodeType.DoubleInt, unaryOp: next, token: nextInt};
                } else {
                    this.lexer.unget(next);
                    return undefined;
                }
            default:
                this.lexer.unget(next);
                return undefined;
        }
    }

    private parseFltgList(fltgSym: Tokens.SymbolToken): Nodes.FloatList {
        const list: Nodes.FloatListMember[] = [];

        while (true) {
            const fltg = this.parseFloat();
            if (fltg) {
                list.push(fltg);
            } else {
                break;
            }
        }

        return {
            type: Nodes.NodeType.FloatList,
            list: list,
            token: fltgSym,
        };
    }

    private parseFloat(): Nodes.FloatListMember | undefined {
        const next = this.lexer.nextNonBlank();
        switch (next.type) {
            case Tokens.TokenType.Comment:
                return this.parseComment(next);
            case Tokens.TokenType.Separator:
            case Tokens.TokenType.EOL:
                return this.parseSeparator(next);
            case Tokens.TokenType.Integer:
                this.lexer.unget(next);
                return {type: Nodes.NodeType.Float, token: this.lexer.nextFloat()};
            case Tokens.TokenType.Char:
                if (["-", "+", "."].includes(next.char) || (next.char >= "0" && next.char <= "9")) {
                    this.lexer.unget(next);
                    return {type: Nodes.NodeType.Float, token: this.lexer.nextFloat()};
                } else {
                    this.lexer.unget(next);
                    return undefined;
                }
            default:
                this.lexer.unget(next);
                return undefined;
        }
    }

    private parseDefine(token: Tokens.SymbolToken): Nodes.DefineStatement {
        const nameElem = this.parseElement();
        if (nameElem.type != Nodes.NodeType.Symbol) {
            throw Parser.mkNodeError("Invalid DEFINE syntax: Expecting symbol", nameElem);
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
                throw Parser.mkNodeError("Invalid DEFINE syntax: Expecting symbols and body", next);
            }
        }

        return {
            type: Nodes.NodeType.Define, name, body, params: params, token
        };
    }

    private parseInvocation(): Nodes.Invocation {
        const nameSym = this.parseElement();
        if (!nameSym || nameSym.type != Nodes.NodeType.Symbol) {
            throw Parser.mkNodeError("Invalid invocation",  nameSym);
        }

        const macro = this.macros.get(nameSym.token.symbol);
        if (!macro) {
            throw Parser.mkNodeError("Not a macro", nameSym);
        }

        const args: Tokens.MacroBodyToken[] = [];
        for (let i = 0; i < macro.params.length; i++) {
            const arg = this.lexer.nextMacroArgument();
            args.push(arg);
        }

        const next = this.lexer.nextNonBlank();
        if (this.couldBeInExpr(next)) {
            throw Parser.mkTokError("Excessive argument for macro", next);
        }
        this.lexer.unget(next);

        return {
            type: Nodes.NodeType.Invocation,
            name: nameSym,
            args: args,
            program: this.createMacroProgram(nameSym.token, macro, args),
        };
    }

    private createMacroProgram(
        nameSym: Tokens.SymbolToken,
        macro: Nodes.DefineStatement,
        args: Tokens.MacroBodyToken[]
    ): Nodes.Program {
        const macroParser = new Parser(`${this.inputName}:${macro.name.token.symbol}`, macro.body.token.body);
        for (let i = 0; i < args.length; i++) {
            macroParser.lexer.addSubstitution(macro.params[i].token.symbol, args[i].body);
        }

        try {
            return macroParser.parseProgram();
        } catch (e) {
            if (!(e instanceof CodeError)) {
                throw e;
            }
            const name = macro.name.token.symbol;
            const line = e.line;
            const col = e.col;
            const msg = e.message;
            throw Parser.mkTokError(`Error invoking ${name}: "${msg}", in invocation line ${line}:${col}`, nameSym);
        }
    }

    public static mkNodeError(msg: string, lastNode: Nodes.Node): CodeError {
        if ("token" in lastNode) {
            return Parser.mkTokError(msg, lastNode.token);
        }

        switch (lastNode.type) {
            case Nodes.NodeType.Program:        return new CodeError(msg, lastNode.inputName, 0, 0);
            case Nodes.NodeType.ExpressionStmt: return Parser.mkNodeError(msg, lastNode.expr);
            case Nodes.NodeType.Invocation:     return Parser.mkTokError(msg, lastNode.name.token);
            case Nodes.NodeType.SymbolGroup:    return Parser.mkTokError(msg, lastNode.first.token);
        }
    }

    public static mkTokError(msg: string, curToken: Tokens.Token): CodeError {
        return Lexer.mkError(msg, curToken.cursor);
    }
}
