import { CodeError } from "../utils/CodeError";
import { Lexer } from "../lexer/Lexer";
import * as Tokens from "../lexer/Token";
import { TokenType } from "../lexer/Token";
import * as Nodes from "./Node";
import { NodeType } from "./Node";
import { normalizeSymbolName } from "../utils/Strings";

type BinOpFragment = {elem: Nodes.Element, op?: Tokens.CharToken};
type KeywordHandler = (symbol: Tokens.SymbolToken) => Nodes.Statement;

export class Parser {
    public static readonly SupportedKeywords = [
        "PAGE",     "FIELD",        "RELOC",
        "IFDEF",    "IFNDEF",       "IFNZRO",   "IFZERO",   "DEFINE",
        "TEXT",     "ZBLOCK",       "DUBL",     "FLTG",     "DEVICE",   "FILENAME",
        "EXPUNGE",  "FIXTAB",       "FIXMRI",
        "DECIMAL",  "OCTAL",
        "NOPUNCH",  "ENPUNCH",
        "EJECT",
    ];
    private keywordActions = new Map<string, KeywordHandler>();
    private inputName: string;
    private lexer: Lexer;
    private macros = new Map<string, Nodes.DefineStatement>();

    public constructor(inputName: string, input: string) {
        this.inputName = inputName;
        this.lexer = new Lexer(inputName, input);

        this.registerKeywords((keyword, action) => {
            // make sure the table actually contains all unnormalized keywords form since
            // they are visible to the outside
            if (!Parser.SupportedKeywords.includes(keyword)) {
                throw Error("Unsupported keyword added");
            }
            this.keywordActions.set(normalizeSymbolName(keyword), action);
        });
    }

    private registerKeywords(mkKeyword: (keyword: string, action: KeywordHandler) => void) {
        mkKeyword("PAGE", token => ({type: NodeType.ChangePage, expr: this.parseOptionalParam(token), token}));
        mkKeyword("FIELD", token => ({type: NodeType.ChangeField, expr: this.parseParam(token), token}));
        mkKeyword("RELOC", token => ({type: NodeType.Reloc, expr: this.parseOptionalParam(token), token}));

        mkKeyword("FIXMRI", token => this.parseFixMri(token));
        mkKeyword("FIXTAB", token => ({type: NodeType.FixTab, token}));
        mkKeyword("EXPUNGE", token => ({type: NodeType.Expunge, token}));

        mkKeyword("DEFINE", token => this.parseDefine(token));
        mkKeyword("IFDEF", token => this.parseIfDef(token, false));
        mkKeyword("IFNDEF", token => this.parseIfDef(token, true));
        mkKeyword("IFZERO", token => this.parseIfZero(token, false));
        mkKeyword("IFNZRO", token => this.parseIfZero(token, true));

        mkKeyword("DECIMAL", token => ({type: NodeType.Radix, radix: 10, token}));
        mkKeyword("OCTAL", token => ({type: NodeType.Radix, radix: 8, token}));

        mkKeyword("ZBLOCK", token => ({type: NodeType.ZeroBlock, expr: this.parseParam(token), token}));
        mkKeyword("TEXT", token => ({type: NodeType.Text, str: this.lexer.nextStringLiteral(true), token}));
        mkKeyword("DUBL", token => this.parseDublList(token));
        mkKeyword("FLTG", token => this.parseFltgList(token));
        mkKeyword("DEVICE", token => ({type: NodeType.DeviceName, name: this.parseSymbol(), token}));
        mkKeyword("FILENAME", token => this.parseFilename(token));

        mkKeyword("EJECT", token => ({type: NodeType.Eject, str: this.lexer.nextStringLiteral(false), token}));
        mkKeyword("ENPUNCH", token => ({type: NodeType.PunchControl, enable: true, token}));
        mkKeyword("NOPUNCH", token => ({type: NodeType.PunchControl, enable: false, token}));
    }

    private parseIfZero(token: Tokens.SymbolToken, invert: boolean): Nodes.Statement {
        return {
            type: invert ? NodeType.IfNotZero : NodeType.IfZero,
            expr: this.parseExpr(),
            body: this.parseMacroBody(),
            token,
        };
    }

    private parseIfDef(token: Tokens.SymbolToken, invert: boolean): Nodes.Statement {
        return {
            type: invert ? NodeType.IfNotDef : NodeType.IfDef,
            symbol: this.parseSymbol(),
            body: this.parseMacroBody(),
            token,
        };
    }

    public parseProgram(): Nodes.Program {
        const prog: Nodes.Program = {
            type: NodeType.Program,
            inputName: this.inputName,
            stmts: [],
            errors: [],
        };

        while (true) {
            try {
                const stmt = this.parseStatement();
                if (!stmt) {
                    break;
                }

                prog.stmts.push(stmt);
            } catch (e) {
                if (e instanceof CodeError) {
                    prog.errors.push(e);
                } else if (e instanceof Error) {
                    prog.errors.push(new CodeError(e.message, this.inputName, 0, 0));
                }
                this.lexer.ignoreCurrentLine();
            }
        };

        return prog;
    }

    private parseStatement(): Nodes.Statement | undefined {
        const tok = this.lexer.nextNonBlank();

        switch (tok.type) {
            case TokenType.Char:
                switch (tok.char) {
                    case "*": return this.parseOriginStatement(tok);
                    case "-": return this.finishExprStatement(tok);
                    case "+": return this.finishExprStatement(tok);
                    case ".": return this.finishExprStatement(tok);
                }
                break;
            case TokenType.ASCII:
            case TokenType.Integer:
                return this.finishExprStatement(tok);
            case TokenType.Symbol:
                return this.finishStatement(tok);
            case TokenType.Comment:
                return this.parseComment(tok);
            case TokenType.EOL:
            case TokenType.Separator:
                return this.parseSeparator(tok);
            case TokenType.EOF:
                return undefined;
        }
        throw Parser.mkTokError(`Statement expected, got ${Tokens.tokenToString(tok)}`, tok);
    }

    private parseSeparator(tok: Tokens.EOLToken | Tokens.SeparatorToken): Nodes.StatementSeparator {
        if (tok.type == TokenType.EOL) {
            return { type: NodeType.Separator, separator: "\n", token: tok };
        } else {
            return {type: NodeType.Separator, separator: tok.char, token: tok};
        }
    }

    private parseComment(tok: Tokens.CommentToken): Nodes.Comment {
        return { type: NodeType.Comment, token: tok };
    }

    private finishStatement(startSym: Tokens.SymbolToken): Nodes.Statement {
        const handler = this.keywordActions.get(normalizeSymbolName(startSym.symbol));
        if (handler) {
            return handler(startSym);
        } else if (this.macros.has(startSym.symbol)) {
            this.lexer.unget(startSym);
            return this.parseInvocation();
        }

        const next = this.lexer.next();
        if (next.type == TokenType.Char) {
            if (next.char == ",") {
                return this.parseLabelDef(startSym, next);
            } else if (next.char == "=") {
                return this.parseAssignment(startSym, next);
            }
        }
        this.lexer.unget(next);
        return this.finishExprStatement(startSym);
    }

    private finishExprStatement(start: Tokens.Token): Nodes.ExpressionStatement {
        this.lexer.unget(start);
        return {
            type: NodeType.ExpressionStmt,
            expr: this.parseExpr(),
        } as Nodes.ExpressionStatement;
    };

    private parseParam(startSym: Tokens.SymbolToken): Nodes.Expression {
        const expr = this.parseOptionalParam(startSym);
        if (!expr) {
            throw Parser.mkTokError("Parameter expected", startSym);
        }
        return expr;
    }

    private parseOptionalParam(startSym: Tokens.SymbolToken): Nodes.Expression | undefined {
        this.lexer.unget(startSym);
        const expr = this.parseExpr();
        if (expr.type != NodeType.SymbolGroup) {
            throw Parser.mkNodeError("Symbol group expected", expr);
        }

        if (expr.exprs.length == 0) {
            return undefined;
        }

        if (expr.exprs.length != 1) {
            throw Parser.mkNodeError("Too many arguments", expr);
        }

        return expr.exprs[0];
    }

    private parseOriginStatement(sym: Tokens.CharToken): Nodes.OriginStatement {
        return {
            type: NodeType.Origin,
            token: sym,
            val: this.parseExpr(),
        };
    }

    private parseLabelDef(sym: Tokens.SymbolToken, chr: Tokens.CharToken): Nodes.LabelDef {
        return {
            type: NodeType.Label,
            sym: {
                type: NodeType.Symbol,
                token: sym,
            },
            token: chr,
        };
    }

    private parseAssignment(sym: Tokens.SymbolToken, chr: Tokens.CharToken): Nodes.AssignStatement {
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

    private parseFixMri(startSym: Tokens.SymbolToken): Nodes.FixMriStatement {
        const nextSym = this.lexer.nextNonBlank();
        if (nextSym.type == TokenType.Symbol) {
            const assign = this.finishStatement(nextSym);
            if (assign.type == NodeType.Assignment) {
                return { type: NodeType.FixMri, assignment: assign, token: startSym };
            }
        }
        throw Parser.mkTokError("FIXMRI must be followed by assignment statement", nextSym);
    }

    private parseFilename(startSym: Tokens.SymbolToken): Nodes.FilenameStatement {
        return {
            type: NodeType.FileName,
            name: this.lexer.nextStringLiteral(false),
            token: startSym,
        };
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

    private parseMacroBody(gotTok?: Tokens.MacroBodyToken): Nodes.MacroBody {
        if (!gotTok) {
            const next = this.lexer.nextNonBlank();
            if (next.type != TokenType.MacroBody) {
                throw Error("Macro body expected");
            }
            gotTok = next;
        }

        return {
            type: NodeType.MacroBody,
            token: gotTok,
        };
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
                        throw Parser.mkTokError(`Unexpected operator in expression: '${nextTok.char}'`, nextTok);
                }
            default:
                this.lexer.unget(nextTok);
                return {elem: firstElem};
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

    private parseElement(): Nodes.Element {
        const tok = this.lexer.nextNonBlank();

        switch (tok.type) {
            case TokenType.ASCII:   return {type: NodeType.ASCIIChar, token: tok};
            case TokenType.Symbol:  return this.parseSymbol(tok);
            case TokenType.Integer: return this.parseInteger(tok);
            case TokenType.Char:
                if (tok.char == ".") {
                    return {
                        type: NodeType.CLCValue,
                        token: tok,
                    };
                } else if (tok.char == "-" || tok.char == "+") {
                    return {
                        type: NodeType.UnaryOp,
                        operator: tok.char,
                        elem: this.parseElement(),
                        token: tok,
                    };
                }
                break;
        }
        throw Parser.mkTokError(`Element expected, got ${Tokens.tokenToString(tok)}`, tok);
    }

    private parseSymbol(gotTok?: Tokens.SymbolToken): Nodes.SymbolNode {
        if (!gotTok) {
            const next = this.lexer.nextNonBlank();
            if (next.type != TokenType.Symbol) {
                throw Parser.mkTokError("Symbol expected", next);
            }
            gotTok = next;
        }
        return {type: NodeType.Symbol, token: gotTok};
    }

    private parseInteger(tok: Tokens.IntegerToken): Nodes.Integer {
        return { type: NodeType.Integer, token: tok };
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
            type: NodeType.DoubleIntList,
            list: list,
            token: dublSym,
        };
    }

    private parseDubl(): Nodes.DublListMember | undefined {
        const next = this.lexer.nextNonBlank();
        switch (next.type) {
            case TokenType.Comment:
                return this.parseComment(next);
            case TokenType.Separator:
            case TokenType.EOL:
                return this.parseSeparator(next);
            case TokenType.Integer:
                return {type: NodeType.DoubleInt, token: next};
            case TokenType.Char:
                if (next.char == "+" || next.char == "-") {
                    const nextInt = this.lexer.next();
                    if (nextInt.type != TokenType.Integer) {
                        throw Parser.mkTokError("Unexpected unary operand", nextInt);
                    }
                    return { type: NodeType.DoubleInt, unaryOp: next, token: nextInt};
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
            type: NodeType.FloatList,
            list: list,
            token: fltgSym,
        };
    }

    private parseFloat(): Nodes.FloatListMember | undefined {
        const next = this.lexer.nextNonBlank();
        switch (next.type) {
            case TokenType.Comment:
                return this.parseComment(next);
            case TokenType.Separator:
            case TokenType.EOL:
                return this.parseSeparator(next);
            case TokenType.Integer:
                this.lexer.unget(next);
                return {type: NodeType.Float, token: this.lexer.nextFloat()};
            case TokenType.Char:
                if (["-", "+", "."].includes(next.char) || (next.char >= "0" && next.char <= "9")) {
                    this.lexer.unget(next);
                    return {type: NodeType.Float, token: this.lexer.nextFloat()};
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
        const nameElem = this.parseSymbol();
        const name = nameElem;
        const params: Nodes.SymbolNode[] = [];
        let body: Nodes.MacroBody;

        while (true) {
            const next = this.lexer.nextNonBlank();
            if (next.type == TokenType.Symbol) {
                params.push(this.parseSymbol(next));
            } else if (next.type == TokenType.MacroBody) {
                body = this.parseMacroBody(next);
                break;
            } else {
                throw Parser.mkTokError("Invalid DEFINE syntax: Expecting symbols and body", next);
            }
        }

        const def: Nodes.DefineStatement = { type: NodeType.Define, name, body, params, token };
        this.macros.set(name.token.symbol, def);
        return def;
    }

    private parseInvocation(): Nodes.Invocation {
        const nameSym = this.parseSymbol();
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
            type: NodeType.Invocation,
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
            case NodeType.Program:        return new CodeError(msg, lastNode.inputName, 0, 0);
            case NodeType.ExpressionStmt: return Parser.mkNodeError(msg, lastNode.expr);
            case NodeType.Invocation:     return Parser.mkTokError(msg, lastNode.name.token);
            case NodeType.SymbolGroup:    return Parser.mkTokError(msg, lastNode.first.token);
        }
    }

    public static mkTokError(msg: string, curToken: Tokens.Token): CodeError {
        return Lexer.mkError(msg, curToken.cursor);
    }
}
