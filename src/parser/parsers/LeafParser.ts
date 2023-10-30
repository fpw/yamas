import { Lexer } from "../../lexer/Lexer";
import * as Tokens from "../../lexer/Token";
import { TokenType } from "../../lexer/Token";
import * as Nodes from "../Node";
import { NodeType } from "../Node";
import { Parser } from "../Parser";

export class LeafParser {
    public constructor(private lexer: Lexer) {
    }

    public parseElement(): Nodes.Element {
        const tok = this.lexer.nextNonBlank();

        switch (tok.type) {
            case TokenType.ASCII:   return { type: NodeType.ASCIIChar, token: tok };
            case TokenType.Symbol:  return this.parseSymbol(tok);
            case TokenType.Integer: return this.parseInteger(tok);
            case TokenType.Char:
                if (tok.char == ".") {
                    return { type: NodeType.CLCValue, token: tok };
                } else if (tok.char == "+" || tok.char == "-") {
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

    public parseSymbol(gotTok?: Tokens.SymbolToken): Nodes.SymbolNode {
        if (!gotTok) {
            const next = this.lexer.nextNonBlank();
            if (next.type != TokenType.Symbol) {
                throw Parser.mkTokError("Symbol expected", next);
            }
            gotTok = next;
        }
        return { type: NodeType.Symbol, token: gotTok };
    }

    public parseInteger(tok: Tokens.IntegerToken): Nodes.Integer {
        return { type: NodeType.Integer, token: tok };
    }

    public parseSeparator(tok: Tokens.EOLToken | Tokens.SeparatorToken): Nodes.StatementSeparator {
        if (tok.type == TokenType.EOL) {
            return { type: NodeType.Separator, separator: "\n", token: tok };
        } else {
            return { type: NodeType.Separator, separator: tok.char, token: tok };
        }
    }

    public parseComment(tok: Tokens.CommentToken): Nodes.Comment {
        return { type: NodeType.Comment, token: tok };
    }

    public parseDubl(): Nodes.DublListMember | undefined {
        const next = this.lexer.nextNonBlank();
        switch (next.type) {
            case TokenType.Comment:
                return this.parseComment(next);
            case TokenType.Separator:
            case TokenType.EOL:
                return this.parseSeparator(next);
            case TokenType.Integer:
                return { type: NodeType.DoubleInt, token: next };
            case TokenType.Char:
                if (next.char == "+" || next.char == "-") {
                    const nextInt = this.lexer.next();
                    if (nextInt.type != TokenType.Integer) {
                        throw Parser.mkTokError("Unexpected unary operand", nextInt);
                    }
                    return { type: NodeType.DoubleInt, unaryOp: next, token: nextInt };
                } else {
                    this.lexer.unget(next);
                    return undefined;
                }
            default:
                this.lexer.unget(next);
                return undefined;
        }
    }

    public parseFloat(): Nodes.FloatListMember | undefined {
        const next = this.lexer.nextNonBlank();
        switch (next.type) {
            case TokenType.Comment:
                return this.parseComment(next);
            case TokenType.Separator:
            case TokenType.EOL:
                return this.parseSeparator(next);
            case TokenType.Integer:
                this.lexer.unget(next);
                return { type: NodeType.Float, token: this.lexer.nextFloat() };
            case TokenType.Char:
                if (["-", "+", "."].includes(next.char) || (next.char >= "0" && next.char <= "9")) {
                    this.lexer.unget(next);
                    return { type: NodeType.Float, token: this.lexer.nextFloat() };
                } else {
                    this.lexer.unget(next);
                    return undefined;
                }
            default:
                this.lexer.unget(next);
                return undefined;
        }
    }
}
