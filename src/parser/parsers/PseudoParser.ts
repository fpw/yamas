import { Lexer } from "../../lexer/Lexer";
import * as Tokens from "../../lexer/Token";
import { TokenType } from "../../lexer/Token";
import { normalizeSymbolName } from "../../utils/Strings";
import { ExprParser } from "./ExprParser";
import { LeafParser } from "./LeafParser";
import * as Nodes from "../Node";
import { NodeType } from "../Node";
import { Parser } from "../Parser";

type KeywordHandler = (symbol: Tokens.SymbolToken) => Nodes.Statement;

export class PseudoParser {
    private keywordActions = new Map<string, KeywordHandler>();

    public constructor(private lexer: Lexer, private leafParser: LeafParser, private exprParser: ExprParser) {
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
        mkKeyword("PAGE", token => ({ type: NodeType.ChangePage, expr: this.parseOptionalParam(token), token }));
        mkKeyword("FIELD", token => ({ type: NodeType.ChangeField, expr: this.parseParam(token), token }));
        mkKeyword("RELOC", token => ({ type: NodeType.Reloc, expr: this.parseOptionalParam(token), token }));

        mkKeyword("FIXMRI", token => this.parseFixMri(token));
        mkKeyword("FIXTAB", token => ({ type: NodeType.FixTab, token }));
        mkKeyword("EXPUNGE", token => ({ type: NodeType.Expunge, token }));

        mkKeyword("DEFINE", token => this.parseDefine(token));
        mkKeyword("IFDEF", token => this.parseIfDef(token, false));
        mkKeyword("IFNDEF", token => this.parseIfDef(token, true));
        mkKeyword("IFZERO", token => this.parseIfZero(token, false));
        mkKeyword("IFNZRO", token => this.parseIfZero(token, true));

        mkKeyword("DECIMAL", token => ({ type: NodeType.Radix, radix: 10, token }));
        mkKeyword("OCTAL", token => ({ type: NodeType.Radix, radix: 8, token }));

        mkKeyword("ZBLOCK", token => ({ type: NodeType.ZeroBlock, expr: this.parseParam(token), token }));
        mkKeyword("TEXT", token => ({ type: NodeType.Text, str: this.lexer.nextStringLiteral(true), token }));
        mkKeyword("DUBL", token => this.parseDublList(token));
        mkKeyword("FLTG", token => this.parseFltgList(token));
        mkKeyword("DEVICE", token => ({ type: NodeType.DeviceName, name: this.leafParser.parseSymbol(), token }));
        mkKeyword("FILENAME", token => this.parseFilename(token));

        mkKeyword("EJECT", token => ({ type: NodeType.Eject, str: this.lexer.nextStringLiteral(false), token }));
        mkKeyword("ENPUNCH", token => ({ type: NodeType.PunchControl, enable: true, token }));
        mkKeyword("NOPUNCH", token => ({ type: NodeType.PunchControl, enable: false, token }));
    }

    public tryHandleKeyword(startSym: Tokens.SymbolToken): Nodes.Statement | undefined {
        const handler = this.keywordActions.get(normalizeSymbolName(startSym.symbol));
        if (!handler) {
            return undefined;
        }
        return handler(startSym);
    }

    private parseParam(startSym: Tokens.SymbolToken): Nodes.Expression {
        const expr = this.parseOptionalParam(startSym);
        if (!expr) {
            throw Parser.mkTokError("Parameter expected", startSym);
        }
        return expr;
    }

    private parseOptionalParam(startSym: Tokens.SymbolToken): Nodes.Expression | undefined {
        this.lexer.unget(startSym);
        const expr = this.exprParser.parseExpr();
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

    private parseIfZero(token: Tokens.SymbolToken, invert: boolean): Nodes.Statement {
        return {
            type: invert ? NodeType.IfNotZero : NodeType.IfZero,
            expr: this.exprParser.parseExpr(),
            body: this.parseMacroBody(),
            token,
        };
    }

    private parseIfDef(token: Tokens.SymbolToken, invert: boolean): Nodes.Statement {
        return {
            type: invert ? NodeType.IfNotDef : NodeType.IfDef,
            symbol: this.leafParser.parseSymbol(),
            body: this.parseMacroBody(),
            token,
        };
    }

    private parseDefine(token: Tokens.SymbolToken): Nodes.DefineStatement {
        const nameElem = this.leafParser.parseSymbol();
        const name = nameElem;
        const params: Nodes.SymbolNode[] = [];
        let body: Nodes.MacroBody;

        while (true) {
            const next = this.lexer.nextNonBlank();
            if (next.type == TokenType.Symbol) {
                params.push(this.leafParser.parseSymbol(next));
            } else if (next.type == TokenType.MacroBody) {
                body = this.parseMacroBody(next);
                break;
            } else {
                throw Parser.mkTokError("Invalid DEFINE syntax: Expecting symbols and body", next);
            }
        }

        return { type: NodeType.Define, name, body, params, token };
    }

    private parseFixMri(startSym: Tokens.SymbolToken): Nodes.FixMriStatement {
        const dstSym = this.lexer.nextNonBlank();
        if (dstSym.type == TokenType.Symbol) {
            const op = this.lexer.next();
            if (op.type == TokenType.Char && op.char == "=") {
                const assign: Nodes.AssignStatement = {
                    type: NodeType.Assignment,
                    sym: this.leafParser.parseSymbol(dstSym),
                    val: this.exprParser.parseExpr(),
                    token: op,
                };
                return { type: NodeType.FixMri, assignment: assign, token: startSym };
            }
        }
        throw Parser.mkTokError("FIXMRI must be followed by assignment statement", startSym);
    }

    private parseFilename(startSym: Tokens.SymbolToken): Nodes.FilenameStatement {
        return {
            type: NodeType.FileName,
            name: this.lexer.nextStringLiteral(false),
            token: startSym,
        };
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

    private parseDublList(dublSym: Tokens.SymbolToken): Nodes.DoubleIntList {
        const list: Nodes.DublListMember[] = [];

        while (true) {
            const dubl = this.leafParser.parseDubl();
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
            const fltg = this.leafParser.parseFloat();
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
}
