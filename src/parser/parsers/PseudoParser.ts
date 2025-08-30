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
import { normalizeSymbolName } from "../../utils/Strings.js";
import { ParserOptions } from "../Parser.js";
import { ParserError } from "../ParserError.js";
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
        mkPseudo("PAGE", token => this.parseWithOptParam<Nodes.ChangePageStatement>(NodeType.ChangePage, token));
        mkPseudo("FIELD", token => this.parseWithOptParam<Nodes.ChangeFieldStatement>(NodeType.ChangeField, token));
        mkPseudo("RELOC", token => this.parseWithOptParam<Nodes.RelocStatement>(NodeType.Reloc, token));

        // Symbols
        mkPseudo("FIXMRI", token => this.parseFixMri(token));
        mkPseudo("FIXTAB", token => this.parseWithoutParam<Nodes.FixTabStatement>(NodeType.FixTab, token));
        mkPseudo("EXPUNGE", token => this.parseWithoutParam<Nodes.ExpungeStatement>(NodeType.Expunge, token));

        // Macros
        mkPseudo("DEFINE", token => this.parseDefine(token));
        mkPseudo("IFDEF", token => this.parseIfDef(token));
        mkPseudo("IFNDEF", token => this.parseIfNotDef(token));
        mkPseudo("IFZERO", token => this.parseIfZero(token));
        mkPseudo("IFNZRO", token => this.parseIfNotZero(token));

        // Data
        mkPseudo("ZBLOCK", token => this.parseWithParam<Nodes.ZBlockStatement>(NodeType.ZeroBlock, token));
        mkPseudo("TEXT", token => this.parseText(token));
        mkPseudo("DUBL", token => this.parseDublList(token));
        mkPseudo("FLTG", token => this.parseFltgList(token));
        mkPseudo("DEVICE", token => this.parseDeviceName(token));
        mkPseudo("FILENAME", token => this.parseFileName(token));

        mkPseudo("DECIMAL", token => this.parseDecimal(token));
        mkPseudo("OCTAL", token => this.parseOctal(token));
        mkPseudo("EJECT", token => this.parseEject(token));
        mkPseudo("XLIST", token => this.parseWithoutParam<Nodes.XListStatement>(NodeType.XList, token));
        mkPseudo("PAUSE", token => this.parseWithoutParam<Nodes.PauseStatement>(NodeType.Pause, token));
        mkPseudo("ENPUNCH", token => this.parsePunchEnable(token));
        mkPseudo("NOPUNCH", token => this.parsePunchDisable(token));
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

    private parseWithoutParam<T extends Nodes.Statement>(type: T["type"], token: Tokens.SymbolToken) {
        return {
            type: type,
            extent: token.extent,
        };
    }

    private parseWithParam<T extends Nodes.Statement>(type: T["type"], token: Tokens.SymbolToken) {
        const param = this.getParam(token);

        return {
            type: type,
            expr: param,
            extent: calcExtent(token, param),
        };
    }

    private parseWithOptParam<T extends Nodes.Statement>(type: T["type"], token: Tokens.SymbolToken) {
        const param = this.getOptionalParam(token);

        return {
            type: type,
            expr: param,
            extent: param ? calcExtent(token, param) : token.extent,
        };
    }

    private getParam(startSym: Tokens.SymbolToken): Nodes.Expression {
        const expr = this.getOptionalParam(startSym);
        if (!expr) {
            throw new ParserError("Parameter expected", startSym);
        }
        return expr;
    }

    private getOptionalParam(startSym: Tokens.SymbolToken): Nodes.Expression | undefined {
        const expr = this.exprParser.parseExpr(startSym);
        if (expr.type == NodeType.ExprGroup) {
            // PSEUDO <space> PARAM -> group
            if (expr.exprs.length != 2) {
                // more than one parameter
                throw new ParserError("Too many arguments", startSym);
            }
            return expr.exprs[1];
        } else if (expr.type == NodeType.Element) {
            // only PSEUDO -> no parameter
            return undefined;
        } else {
            throw new ParserError("Pseudo with optional parameter expected", startSym);
        }
    }

    private parsePunchDisable(token: Tokens.SymbolToken): Nodes.PunchCtrlStatement {
        return {
            type: NodeType.PunchControl,
            enable: false,
            extent: token.extent,
        };
    }

    private parsePunchEnable(token: Tokens.SymbolToken): Nodes.PunchCtrlStatement {
        return {
            type: NodeType.PunchControl,
            enable: true,
            extent: token.extent,
        };
    }

    private parseOctal(token: Tokens.SymbolToken): Nodes.RadixStatement {
        return {
            type: NodeType.Radix,
            radix: 8,
            extent: token.extent,
        };
    }

    private parseDecimal(token: Tokens.SymbolToken): Nodes.RadixStatement {
        return {
            type: NodeType.Radix,
            radix: 10,
            extent: token.extent,
        };
    }

    private parseDeviceName(token: Tokens.SymbolToken): Nodes.DevNameStatement {
        const nameSym = this.commonParser.parseSymbol();

        return {
            type: NodeType.DeviceName,
            name: nameSym.name,
            extent: calcExtent(token, nameSym),
        };
    }

    private parseEject(token: Tokens.SymbolToken): Nodes.EjectStatement {
        const strTok = this.lexer.nextStringLiteral(false);
        const str = strTok.str.trim();

        return {
            type: NodeType.Eject,
            text: str.length > 0 ? str : undefined,
            extent: calcExtent(token, str.length ? strTok : undefined),
        };
    }

    private parseText(token: Tokens.SymbolToken): Nodes.TextStatement {
        const strTok = this.lexer.nextStringLiteral(true);
        return {
            type: NodeType.Text,
            text: strTok.str,
            extent: calcExtent(token, strTok),
        };
    }

    private parseIfZero(token: Tokens.SymbolToken): Nodes.IfZeroStatement {
        const expr = this.exprParser.parseExpr();
        const body = this.parseMacroBody();

        return {
            type: NodeType.IfZero,
            expr: expr,
            body: body,
            extent: calcExtent(token, body),
        };
    }

    private parseIfNotZero(token: Tokens.SymbolToken): Nodes.IfNotZeroStatement {
        const expr = this.exprParser.parseExpr();
        const body = this.parseMacroBody();

        return {
            type: NodeType.IfNotZero,
            expr: expr,
            body: body,
            extent: calcExtent(token, body),
        };
    }

    private parseIfDef(token: Tokens.SymbolToken): Nodes.IfDefStatement {
        const symbol = this.commonParser.parseSymbol();
        const body = this.parseMacroBody();

        return {
            type: NodeType.IfDef,
            symbol: symbol,
            body: body,
            extent: calcExtent(token, body),
        };
    }

    private parseIfNotDef(token: Tokens.SymbolToken): Nodes.IfNotDefStatement {
        const symbol = this.commonParser.parseSymbol();
        const body = this.parseMacroBody();

        return {
            type: NodeType.IfNotDef,
            symbol: symbol,
            body: body,
            extent: calcExtent(token, body),
        };
    }

    private parseDefine(defineTok: Tokens.SymbolToken): Nodes.DefineStatement {
        const nameElem = this.commonParser.parseSymbol();
        const name = nameElem;
        const params: Nodes.SymbolNode[] = [];
        let body: Nodes.MacroBody;

        while (true) {
            const next = this.lexer.nextNonBlank(true);
            if (next.type == TokenType.Symbol) {
                params.push(this.commonParser.parseSymbol(next));
            } else if (next.type == TokenType.MacroBody) {
                body = this.parseMacroBody(next);
                break;
            } else {
                throw new ParserError("Invalid DEFINE syntax: Expecting symbols and body", next);
            }
        }

        return { type: NodeType.Define, macro: name, body, params, extent: calcExtent(defineTok, body) };
    }

    private parseFixMri(startSym: Tokens.SymbolToken): Nodes.FixMriStatement {
        const dstTok = this.lexer.nextNonBlank(false);
        if (dstTok.type == TokenType.Symbol) {
            const op = this.lexer.next();
            if (op.type == TokenType.Char && op.char == "=") {
                const dstSym = this.commonParser.parseSymbol(dstTok);
                const expr = this.exprParser.parseExpr();

                const assign: Nodes.AssignStatement = {
                    type: NodeType.Assignment,
                    sym: dstSym,
                    val: expr,
                    extent: calcExtent(dstSym, expr),
                };
                return { type: NodeType.FixMri, assignment: assign, extent: calcExtent(startSym, expr) };
            }
        }
        throw new ParserError("FIXMRI must be followed by assignment statement", startSym);
    }

    private parseFileName(startSym: Tokens.SymbolToken): Nodes.FilenameStatement {
        const strTok = this.lexer.nextStringLiteral(false);
        return {
            type: NodeType.FileName,
            name: strTok.str,
            extent: calcExtent(startSym, strTok),
        };
    }

    private parseMacroBody(gotTok?: Tokens.MacroBodyToken): Nodes.MacroBody {
        if (!gotTok) {
            const next = this.lexer.nextNonBlank(true);
            if (next.type != TokenType.MacroBody) {
                throw new ParserError("Macro body expected", next);
            }
            gotTok = next;
        }

        const next = this.lexer.nextNonBlank(false);
        if (next.type != TokenType.Separator && next.type != TokenType.Comment &&
            next.type != TokenType.EOL && next.type != TokenType.EOF
        ) {
            throw new ParserError("Stray token after macro body", next);
        }
        this.lexer.unget(next);

        return {
            type: NodeType.MacroBody,
            code: gotTok.body,
            extent: gotTok.extent,
        };
    }

    private parseDublList(dublSym: Tokens.SymbolToken): Nodes.DoubleIntList {
        const list: Nodes.DublListMember[] = [];
        let lastTok: Tokens.Token | undefined;
        let gotSep = true;

        while (!lastTok || lastTok.type != TokenType.EOF) {
            const dubl = this.parseDubl();
            if (dubl) {
                list.push(dubl[0]);
                lastTok = dubl[1];
                if (dubl[0].type == NodeType.DoubleInt) {
                    if (!gotSep) {
                        throw new ParserError(`Separator expected, got ${tokenToString(lastTok)}`, lastTok);
                    }
                    gotSep = false;
                } else {
                    gotSep = true;
                }
            } else {
                break;
            }
        }

        // make sure that we leave the last separator to finish the statement
        if (lastTok) {
            list.pop();
            this.lexer.unget(lastTok);
        }

        return {
            type: NodeType.DoubleIntList,
            list: list,
            extent: calcExtent(dublSym, list[list.length - 1]),
        };
    }

    private parseFltgList(fltgSym: Tokens.SymbolToken): Nodes.FloatList {
        const list: Nodes.FloatListMember[] = [];
        let lastTok: Tokens.Token | undefined;
        let gotSep = true;

        while (!lastTok || lastTok.type != TokenType.EOF) {
            const fltg = this.parseFloat();
            if (fltg) {
                list.push(fltg[0]);
                lastTok = fltg[1];
                if (fltg[0].type == NodeType.Float) {
                    if (!gotSep) {
                        throw new ParserError(`Separator expected, got ${tokenToString(lastTok)}`, lastTok);
                    }
                    gotSep = false;
                } else {
                    gotSep = true;
                }
            } else {
                break;
            }
        }

        // make sure that we leave the last separator to finish the statement
        if (lastTok) {
            list.pop();
            this.lexer.unget(lastTok);
        }

        return {
            type: NodeType.FloatList,
            list: list,
            extent: calcExtent(fltgSym, list[list.length - 1]),
        };
    }

    private parseDubl(): [Nodes.DublListMember, Tokens.Token] | undefined {
        const tok = this.lexer.nextNonBlank(false);
        if (this.commonParser.isStatementEnd(tok)) {
            const member = this.commonParser.parseStatementEnd(tok);
            return [member, tok];
        }

        switch (tok.type) {
            case TokenType.Comment:
                return [this.commonParser.parseComment(tok), tok];
            case TokenType.Integer:
                return [{ type: NodeType.DoubleInt, value: tok.value, extent: tok.extent }, tok];
            case TokenType.Char:
                if (tok.char == "+" || tok.char == "-") {
                    const nextInt = this.lexer.next();
                    if (nextInt.type != TokenType.Integer) {
                        throw new ParserError("Unexpected unary operand", nextInt);
                    }
                    const unary = this.commonParser.toUnaryOp(tok);
                    return [{
                        type: NodeType.DoubleInt,
                        unaryOp: unary,
                        value: nextInt.value,
                        extent: calcExtent(unary, nextInt),
                    }, tok];
                } else {
                    throw new ParserError("Unexpected character in DUBL", tok);
                }
            default:
                this.lexer.unget(tok);
                return undefined;
        }
    }

    private parseFloat(): [Nodes.FloatListMember, Tokens.Token] | undefined {
        const tok = this.lexer.nextNonBlank(false);
        if (this.commonParser.isStatementEnd(tok)) {
            return [this.commonParser.parseStatementEnd(tok), tok];
        }

        switch (tok.type) {
            case TokenType.Comment:
                return [this.commonParser.parseComment(tok), tok];
            case TokenType.Integer:
                this.lexer.unget(tok);
                const floatTok = this.lexer.nextFloat();
                return [{ type: NodeType.Float, value: floatTok.value, extent: floatTok.extent }, tok];
            case TokenType.Char:
                if (tok.char == "+" || tok.char == "-") {
                    const unary = this.commonParser.toUnaryOp(tok);
                    const floatTok = this.lexer.nextFloat();
                    return [{
                        type: NodeType.Float,
                        unaryOp: unary,
                        value: floatTok.value,
                        extent: calcExtent(unary, floatTok),
                    }, tok];
                } else if (tok.char == ".") {
                    this.lexer.unget(tok);
                    const floatTok = this.lexer.nextFloat();
                    return [{ type: NodeType.Float, value: floatTok.value, extent: floatTok.extent }, tok];
                }
        }
        this.lexer.unget(tok);
        return undefined;
    }
}
