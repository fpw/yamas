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

import { calcExtent } from "../../lexer/Cursor.js";
import { Lexer } from "../../lexer/Lexer.js";
import * as Tokens from "../../lexer/Token.js";
import { TokenType } from "../../lexer/Token.js";
import { tokenToString } from "../../lexer/formatToken.js";
import { Parser, ParserOptions } from "../Parser.js";
import { ParserError } from "../ParserError.js";
import * as Nodes from "../nodes/Node.js";
import { NodeType } from "../nodes/Node.js";
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

    public parseInstruction(): Nodes.Instruction {
        const labels: Nodes.LabelDef[] = [];
        let statement: Nodes.Statement | undefined;
        let comment: Nodes.Comment | undefined;
        let end: Nodes.StatementSeparator | undefined;

        while (true) {
            const tok = this.lexer.nextNonBlank(false);
            if (this.commonParser.isStatementEnd(tok)) {
                end = this.commonParser.parseStatementEnd(tok);
                break;
            } else if (tok.type == TokenType.Comment) {
                comment = this.commonParser.parseComment(tok);
                end = this.commonParser.parseStatementEnd();
                break;
            } else if (!statement) {
                const curStmt = this.parseStatementOrLabel(tok);
                if (curStmt.type == NodeType.Label) {
                    labels.push(curStmt);
                } else {
                    statement = curStmt;
                }
            } else {
                throw new ParserError("Expected instruction with single statement", tok);
            }
        }
        const first = labels[0] ?? statement ?? end;
        const last = end ?? statement ?? labels[labels.length - 1];

        return {
            type: NodeType.Instruction, labels, statement, comment, end,
            extent: calcExtent(first, last),
        };
    }

    private parseStatementOrLabel(gotTok?: Tokens.Token): Nodes.Statement | Nodes.LabelDef {
        const tok = this.lexer.nextNonBlank(false, gotTok);

        switch (tok.type) {
            case TokenType.Char:
                switch (tok.char) {
                    case "*":
                        return this.parseOriginStatement(tok);
                    case "+":
                    case "-":
                    case "(":
                    case "[":
                    case ".":
                        return this.parseExprStatement(tok);
                }
                break;
            case TokenType.ASCII:
            case TokenType.Integer:
                return this.parseExprStatement(tok);
            case TokenType.Symbol:
                return this.parseStatementWithSymbol(tok);
        }
        throw new ParserError(`Statement expected, got ${tokenToString(tok)}`, tok);
    }

    private parseStatementWithSymbol(startSym: Tokens.SymbolToken): Nodes.Statement | Nodes.LabelDef {
        const pseudo = this.pseudoParser.tryHandlePseudo(startSym);
        if (pseudo) {
            if (pseudo.type == NodeType.Define) {
                // need to remember macro names so that we can distinguish invocations from symbol groups
                this.macros.set(pseudo.macro.name, pseudo);
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
        const expr = this.exprParser.parseExpr(gotTok);
        return {
            type: NodeType.ExpressionStmt,
            expr: expr,
            extent: expr.extent,
        };
    };

    private parseOriginStatement(sym: Tokens.CharToken): Nodes.OriginStatement {
        const expr = this.exprParser.parseExpr();

        return {
            type: NodeType.Origin,
            val: expr,
            extent: calcExtent(sym, expr),
        };
    }

    private parseLabelDef(sym: Tokens.SymbolToken, comma: Tokens.CharToken): Nodes.LabelDef {
        return {
            type: NodeType.Label,
            sym: {
                type: NodeType.Symbol,
                name: sym.name,
                extent: sym.extent,
            },
            extent: calcExtent(sym, comma),
        };
    }

    private parseAssignment(sym: Tokens.SymbolToken, eq: Tokens.CharToken): Nodes.AssignStatement {
        const expr = this.exprParser.parseExpr();

        return {
            type: NodeType.Assignment,
            sym: {
                type: NodeType.Symbol,
                name: sym.name,
                extent: sym.extent,
            },
            val: expr,
            extent: calcExtent(sym, expr),
        };
    }

    private parseInvocation(): Nodes.Invocation {
        const macroSym = this.commonParser.parseSymbol();
        const macro = this.macros.get(macroSym.name);
        if (!macro) {
            throw new ParserError("Not a macro", macroSym);
        }

        const args: Tokens.MacroBodyToken[] = [];
        for (const _param of macro.params) {
            const arg = this.lexer.nextMacroArgument();
            args.push(arg);
        }

        const next = this.lexer.nextNonBlank(false);
        if (![TokenType.Comment, TokenType.Separator, TokenType.EOF, TokenType.EOL].includes(next.type)) {
            throw new ParserError("Excessive argument for macro", next);
        }
        this.lexer.unget(next);

        return {
            type: NodeType.Invocation,
            macro: macroSym,
            args: args.map(a => a.body),
            program: this.createInvocationProgram(macroSym, macro, args),
            extent: calcExtent(macroSym, args[args.length - 1]),
        };
    }

    private createInvocationProgram(
        nameNode: Nodes.SymbolNode,
        define: Nodes.DefineStatement,
        args: Tokens.MacroBodyToken[]
    ): Nodes.Program {
        const name = `${this.lexer.getInputName()}:${define.macro.name}`;
        const macroParser = new Parser(this.opts, name, define.body.code);
        for (let i = 0; i < args.length; i++) {
            macroParser.addSubstitution(define.params[i].name, args[i].body);
        }

        const prog = macroParser.parseProgram();
        if (prog.errors.length > 0) {
            const name = define.macro.name;
            throw new ParserError(`Error invoking ${name}: "${prog.errors[0].message}"`, nameNode);
        }
        return prog;
    }
}
