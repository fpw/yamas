/*
 *   Yamas - Yet Another Macro Assembler (for the PDP-8)
 *   Copyright (C) 2023 Folke Will <folko@solhost.org>
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Affero General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU Affero General Public License for more details.
 *
 *   You should have received a copy of the GNU Affero General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { Lexer } from "../../lexer/Lexer.js";
import * as Tokens from "../../lexer/Token.js";
import { TokenType } from "../../lexer/Token.js";
import { CodeError } from "../../utils/CodeError.js";
import * as Nodes from "../Node.js";
import { NodeType } from "../Node.js";
import { Parser, ParserOptions } from "../Parser.js";
import { CommonParser } from "./CommonParser.js";
import { ExprParser } from "./ExprParser.js";
import { PseudoParser } from "./PseudoParser.js";

export class StatementParser {
    private commonParser: CommonParser;
    private exprParser: ExprParser;
    private pseudoParser: PseudoParser;
    private macros = new Map<string, Nodes.DefineStatement>();

    public constructor(private opts: ParserOptions, private lexer: Lexer) {
        this.commonParser = new CommonParser(opts, this.lexer);
        this.exprParser = new ExprParser(opts, this.lexer, this.commonParser);
        this.pseudoParser = new PseudoParser(opts, lexer, this.commonParser, this.exprParser);
    }

    public parseStatement(): Nodes.Statement | undefined {
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
                return this.commonParser.parseComment(tok);
            case TokenType.EOL:
            case TokenType.Separator:
                return this.commonParser.parseSeparator(tok);
            case TokenType.EOF:
                return undefined;
        }
        throw Tokens.mkTokError(`Statement expected, got ${Tokens.tokenToString(tok)}`, tok);
    }

    private finishStatement(startSym: Tokens.SymbolToken): Nodes.Statement {
        const pseudo = this.pseudoParser.tryHandlePseudo(startSym);
        if (pseudo) {
            if (pseudo.type == NodeType.Define) {
                // need to remember macro names so that we can distinguish invocations from symbol groups
                this.macros.set(pseudo.name.name, pseudo);
            }
            return pseudo;
        } else if (this.macros.has(startSym.name)) {
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
                name: sym.name,
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
                name: sym.name,
                token: sym,
            },
            val: this.exprParser.parseExpr(),
            token: chr,
        };
    }

    private parseInvocation(): Nodes.Invocation {
        const macroSym = this.commonParser.parseSymbol();
        const macro = this.macros.get(macroSym.name);
        if (!macro) {
            throw Nodes.mkNodeError("Not a macro", macroSym);
        }

        const args: Tokens.MacroBodyToken[] = [];
        for (let i = 0; i < macro.params.length; i++) {
            const arg = this.lexer.nextMacroArgument();
            args.push(arg);
        }

        const next = this.lexer.nextNonBlank();
        if (![TokenType.Comment, TokenType.Separator, TokenType.EOF, TokenType.EOL].includes(next.type)) {
            throw Tokens.mkTokError("Excessive argument for macro", next);
        }
        this.lexer.unget(next);

        return {
            type: NodeType.Invocation,
            macro: macroSym,
            args: args,
            program: this.createInvocationProgram(macroSym.token, macro, args),
        };
    }

    private createInvocationProgram(
        nameSym: Tokens.SymbolToken,
        macro: Nodes.DefineStatement,
        args: Tokens.MacroBodyToken[]
    ): Nodes.Program {
        const name = `${this.lexer.getInputName()}:${macro.name.name}`;
        const macroParser = new Parser(this.opts, name, macro.body.code);
        for (let i = 0; i < args.length; i++) {
            macroParser.addSubstitution(macro.params[i].name, args[i].body);
        }

        try {
            return macroParser.parseProgram();
        } catch (e) {
            if (!(e instanceof CodeError)) {
                throw e;
            }
            const name = macro.name.name;
            const line = e.line;
            const col = e.col;
            const msg = e.message;
            throw Tokens.mkTokError(`Error invoking ${name}: "${msg}", in invocation line ${line}:${col}`, nameSym);
        }
    }
}
