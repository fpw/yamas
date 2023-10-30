import { Lexer } from "../lexer/Lexer";
import * as Tokens from "../lexer/Token";
import { TokenType } from "../lexer/Token";
import { CodeError } from "../utils/CodeError";
import { ExprParser } from "./parsers/ExprParser";
import { LeafParser } from "./parsers/LeafParser";
import * as Nodes from "./Node";
import { NodeType } from "./Node";
import { PseudoParser } from "./parsers/PseudoParser";

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
    private inputName: string;
    private lexer: Lexer;
    private macros = new Map<string, Nodes.DefineStatement>();
    private leafParser: LeafParser;
    private exprParser: ExprParser;
    private pseudoParser: PseudoParser;

    public constructor(inputName: string, input: string) {
        this.inputName = inputName;
        this.lexer = new Lexer(inputName, input);
        this.leafParser = new LeafParser(this.lexer);
        this.exprParser = new ExprParser(this.lexer, this.leafParser);
        this.pseudoParser = new PseudoParser(this.lexer, this.leafParser, this.exprParser);
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
                    case "*":
                        return this.parseOriginStatement(tok);
                    case "+":
                    case "-":
                    case ".":
                        return this.parseExprStatement(tok);
                }
                break;
            case TokenType.ASCII:
            case TokenType.Integer:
                return this.parseExprStatement(tok);
            case TokenType.Symbol:
                return this.finishStatement(tok);
            case TokenType.Comment:
                return this.leafParser.parseComment(tok);
            case TokenType.EOL:
            case TokenType.Separator:
                return this.leafParser.parseSeparator(tok);
            case TokenType.EOF:
                return undefined;
        }
        throw Parser.mkTokError(`Statement expected, got ${Tokens.tokenToString(tok)}`, tok);
    }

    private finishStatement(startSym: Tokens.SymbolToken): Nodes.Statement {
        const pseudo = this.pseudoParser.tryHandleKeyword(startSym);
        if (pseudo) {
            if (pseudo.type == NodeType.Define) {
                // need to remember macro names so that we can distinguish invocations from symbol groups
                this.macros.set(pseudo.name.token.symbol, pseudo);
            }
            return pseudo;
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
        return this.parseExprStatement(startSym);
    }

    private parseExprStatement(gotTok?: Tokens.Token): Nodes.ExpressionStatement {
        if (gotTok) {
            this.lexer.unget(gotTok);
        }

        return {
            type: NodeType.ExpressionStmt,
            expr: this.exprParser.parseExpr(),
        } as Nodes.ExpressionStatement;
    };

    private parseOriginStatement(sym: Tokens.CharToken): Nodes.OriginStatement {
        return {
            type: NodeType.Origin,
            token: sym,
            val: this.exprParser.parseExpr(),
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
            val: this.exprParser.parseExpr(),
            token: chr,
        };
    }

    private parseInvocation(): Nodes.Invocation {
        const nameSym = this.leafParser.parseSymbol();
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
        if (![TokenType.Comment, TokenType.Separator, TokenType.EOF, TokenType.EOL].includes(next.type)) {
            throw Parser.mkTokError("Excessive argument for macro", next);
        }
        this.lexer.unget(next);

        return {
            type: NodeType.Invocation,
            name: nameSym,
            args: args,
            program: this.createInvocationProgram(nameSym.token, macro, args),
        };
    }

    private createInvocationProgram(
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
