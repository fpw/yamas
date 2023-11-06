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
import { normalizeSymbolName } from "../../utils/Strings.js";
import { ParserOptions } from "../Parser.js";
import * as Nodes from "../nodes/Node.js";
import { NodeType } from "../nodes/Node.js";
import { CommonParser } from "./CommonParser.js";
import { ExprParser } from "./ExprParser.js";

type PseudoHandler = (symbol: Tokens.SymbolToken) => Nodes.Statement;

export class PseudoParser {
    public static readonly SupportedPseudos = [
        "PAGE",     "FIELD",        "RELOC",
        "IFDEF",    "IFNDEF",       "IFNZRO",   "IFZERO",   "DEFINE",
        "TEXT",     "ZBLOCK",       "DUBL",     "FLTG",     "DEVICE",   "FILENAME",
        "EXPUNGE",  "FIXTAB",       "FIXMRI",
        "DECIMAL",  "OCTAL",
        "NOPUNCH",  "ENPUNCH",
        "EJECT",    "XLIST",        "PAUSE",
    ];
    private pseudoActions = new Map<string, PseudoHandler>();

    public constructor(
        private opts: ParserOptions,
        private lexer: Lexer,
        private commonParser: CommonParser,
        private exprParser: ExprParser
    ) {
        this.registerPseudos((pseudo, action) => {
            if (this.opts.disabledPseudos?.includes(pseudo)) {
                return;
            }

            // make sure the table actually contains all unnormalized pseudo forms since
            // they are visible to the outside
            if (!PseudoParser.SupportedPseudos.includes(pseudo)) {
                throw Error("Unsupported pseudo added");
            }
            this.pseudoActions.set(normalizeSymbolName(pseudo), action);
        });
    }

    private registerPseudos(mkPseudo: (pseudo: string, action: PseudoHandler) => void) {
        // Origin
        mkPseudo("PAGE", token => ({ type: NodeType.ChangePage, expr: this.parseOptionalParam(token), token }));
        mkPseudo("FIELD", token => ({ type: NodeType.ChangeField, expr: this.parseParam(token), token }));
        mkPseudo("RELOC", token => ({ type: NodeType.Reloc, expr: this.parseOptionalParam(token), token }));

        // Symbols
        mkPseudo("FIXMRI", token => this.parseFixMri(token));
        mkPseudo("FIXTAB", token => ({ type: NodeType.FixTab, token }));
        mkPseudo("EXPUNGE", token => ({ type: NodeType.Expunge, token }));

        // Macros
        mkPseudo("DEFINE", token => this.parseDefine(token));
        mkPseudo("IFDEF", token => this.parseIfDef(token));
        mkPseudo("IFNDEF", token => this.parseIfNotDef(token));
        mkPseudo("IFZERO", token => this.parseIfZero(token));
        mkPseudo("IFNZRO", token => this.parseIfNotZero(token));

        // Data
        mkPseudo("ZBLOCK", token => ({ type: NodeType.ZeroBlock, expr: this.parseParam(token), token }));
        mkPseudo("TEXT", token => this.parseText(token));
        mkPseudo("DUBL", token => this.parseDublList(token));
        mkPseudo("FLTG", token => this.parseFltgList(token));
        mkPseudo("DEVICE", token => this.parseDeviceName(token));
        mkPseudo("FILENAME", token => this.parseFileName(token));

        mkPseudo("DECIMAL", token => ({ type: NodeType.Radix, radix: 10, token }));
        mkPseudo("OCTAL", token => ({ type: NodeType.Radix, radix: 8, token }));
        mkPseudo("EJECT", token => this.parseEject(token));
        mkPseudo("XLIST", token => ({ type: NodeType.XList, token }));
        mkPseudo("PAUSE", token => ({ type: NodeType.Pause, token }));
        mkPseudo("ENPUNCH", token => ({ type: NodeType.PunchControl, enable: true, token }));
        mkPseudo("NOPUNCH", token => ({ type: NodeType.PunchControl, enable: false, token }));
    }

    private parseDeviceName(token: Tokens.SymbolToken): Nodes.DevNameStatement {
        const nameSym = this.commonParser.parseSymbol();

        return {
            type: NodeType.DeviceName,
            name: nameSym.name,
            nameTok: nameSym.token,
            token
        };
    }

    private parseEject(token: Tokens.SymbolToken): Nodes.EjectStatement {
        const strTok = this.lexer.nextStringLiteral(false);
        const str = strTok.str.trim();

        return {
            type: NodeType.Eject,
            text: str.length > 0 ? str : undefined,
            str: str.length > 0 ? strTok : undefined,
            token
        };
    }

    private parseText(token: Tokens.SymbolToken): Nodes.TextStatement {
        const strTok = this.lexer.nextStringLiteral(true);
        return {
            type: NodeType.Text,
            text: strTok.str,
            strToken: strTok,
            token: token,
        };
    }

    public disablePseudo(pseudo: string) {
        this.pseudoActions.delete(pseudo);
    }

    public tryHandlePseudo(startSym: Tokens.SymbolToken): Nodes.Statement | undefined {
        const handler = this.pseudoActions.get(normalizeSymbolName(startSym.name));
        if (!handler) {
            return undefined;
        }
        return handler(startSym);
    }

    private parseParam(startSym: Tokens.SymbolToken): Nodes.Expression {
        const expr = this.parseOptionalParam(startSym);
        if (!expr) {
            throw Tokens.mkTokError("Parameter expected", startSym);
        }
        return expr;
    }

    private parseOptionalParam(startSym: Tokens.SymbolToken): Nodes.Expression | undefined {
        this.lexer.unget(startSym);
        const expr = this.exprParser.parseExpr();
        if (expr.type != NodeType.SymbolGroup) {
            throw Nodes.mkNodeError("Symbol group expected", expr);
        }

        if (expr.exprs.length == 0) {
            return undefined;
        }

        if (expr.exprs.length != 1) {
            throw Nodes.mkNodeError("Too many arguments", expr);
        }

        return expr.exprs[0];
    }

    private parseIfZero(token: Tokens.SymbolToken): Nodes.IfZeroStatement {
        return {
            type: NodeType.IfZero,
            expr: this.exprParser.parseExpr(),
            body: this.parseMacroBody(),
            token,
        };
    }

    private parseIfNotZero(token: Tokens.SymbolToken): Nodes.IfNotZeroStatement {
        return {
            type: NodeType.IfNotZero,
            expr: this.exprParser.parseExpr(),
            body: this.parseMacroBody(),
            token,
        };
    }

    private parseIfDef(token: Tokens.SymbolToken): Nodes.IfDefStatement {
        return {
            type: NodeType.IfDef,
            symbol: this.commonParser.parseSymbol(),
            body: this.parseMacroBody(),
            token,
        };
    }

    private parseIfNotDef(token: Tokens.SymbolToken): Nodes.IfNotDefStatement {
        return {
            type: NodeType.IfNotDef,
            symbol: this.commonParser.parseSymbol(),
            body: this.parseMacroBody(),
            token,
        };
    }

    private parseDefine(defineTok: Tokens.SymbolToken): Nodes.DefineStatement {
        const nameElem = this.commonParser.parseSymbol();
        const name = nameElem;
        const params: Nodes.SymbolNode[] = [];
        let body: Nodes.MacroBody;

        while (true) {
            const next = this.lexer.nextNonBlank(undefined, true);
            if (next.type == TokenType.Symbol) {
                params.push(this.commonParser.parseSymbol(next));
            } else if (next.type == TokenType.MacroBody) {
                body = this.parseMacroBody(next);
                break;
            } else {
                throw Tokens.mkTokError("Invalid DEFINE syntax: Expecting symbols and body", next);
            }
        }

        return { type: NodeType.Define, name, body, params, token: defineTok };
    }

    private parseFixMri(startSym: Tokens.SymbolToken): Nodes.FixMriStatement {
        const dstSym = this.lexer.nextNonBlank();
        if (dstSym.type == TokenType.Symbol) {
            const op = this.lexer.next();
            if (op.type == TokenType.Char && op.char == "=") {
                const assign: Nodes.AssignStatement = {
                    type: NodeType.Assignment,
                    sym: this.commonParser.parseSymbol(dstSym),
                    val: this.exprParser.parseExpr(),
                    token: op,
                };
                return { type: NodeType.FixMri, assignment: assign, token: startSym };
            }
        }
        throw Tokens.mkTokError("FIXMRI must be followed by assignment statement", startSym);
    }

    private parseFileName(startSym: Tokens.SymbolToken): Nodes.FilenameStatement {
        const strTok = this.lexer.nextStringLiteral(false);
        return {
            type: NodeType.FileName,
            name: strTok.str,
            strTok: strTok,
            token: startSym,
        };
    }

    private parseMacroBody(gotTok?: Tokens.MacroBodyToken): Nodes.MacroBody {
        if (!gotTok) {
            const next = this.lexer.nextNonBlank(undefined, true);
            if (next.type != TokenType.MacroBody) {
                throw Tokens.mkTokError("Macro body expected", next);
            }
            gotTok = next;
        }

        const next = this.lexer.nextNonBlank();
        if (next.type != TokenType.Separator && next.type != TokenType.Comment &&
            next.type != TokenType.EOL && next.type != TokenType.EOF
        ) {
            throw Tokens.mkTokError("Stray token after macro body", next);
        }
        this.lexer.unget(next);

        return {
            type: NodeType.MacroBody,
            code: gotTok.body,
            token: gotTok,
        };
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

    private parseDubl(): Nodes.DublListMember | undefined {
        const next = this.lexer.nextNonBlank();
        switch (next.type) {
            case TokenType.Comment:
                return this.commonParser.parseComment(next);
            case TokenType.Separator:
            case TokenType.EOL:
                return this.commonParser.parseSeparator(next);
            case TokenType.Integer:
                return { type: NodeType.DoubleInt, value: next.value, token: next };
            case TokenType.Char:
                if (next.char == "+" || next.char == "-") {
                    const nextInt = this.lexer.next();
                    if (nextInt.type != TokenType.Integer) {
                        throw Tokens.mkTokError("Unexpected unary operand", nextInt);
                    }
                    return {
                        type: NodeType.DoubleInt,
                        unaryOp: this.commonParser.toUnaryOp(next),
                        value: nextInt.value,
                        token: nextInt,
                    };
                } else {
                    throw Tokens.mkTokError("Unexpected character in DUBL", next);
                }
            default:
                this.lexer.unget(next);
                return undefined;
        }
    }

    private parseFloat(): Nodes.FloatListMember | undefined {
        const next = this.lexer.nextNonBlank();
        switch (next.type) {
            case TokenType.Comment:
                return this.commonParser.parseComment(next);
            case TokenType.Separator:
            case TokenType.EOL:
                return this.commonParser.parseSeparator(next);
            case TokenType.Integer:
                this.lexer.unget(next);
                const floatTok = this.lexer.nextFloat();
                return { type: NodeType.Float, value: floatTok.value, token: floatTok };
            case TokenType.Char:
                if (["-", "+"].includes(next.char)) {
                    const floatTok = this.lexer.nextFloat();
                    return {
                        type: NodeType.Float,
                        unaryOp: this.commonParser.toUnaryOp(next),
                        value: floatTok.value,
                        token: floatTok
                    };
                } else if (next.char == ".") {
                    this.lexer.unget(next);
                    const floatTok = this.lexer.nextFloat();
                    return {
                        type: NodeType.Float,
                        value: floatTok.value,
                        token: floatTok
                    };
                }
        }
        this.lexer.unget(next);
        return undefined;
    }
}
