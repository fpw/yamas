import { replaceBlanks } from "../utils/Strings.js";
import { Token, TokenType } from "./Token.js";

export function tokenToString(tok: Token): string {
    switch (tok.type) {
        case TokenType.Blank:       return `Blank('${replaceBlanks(tok.char)}')`;
        case TokenType.Char:        return `Char('${replaceBlanks(tok.char)}')`;
        case TokenType.ASCII:       return `ASCII('${replaceBlanks(tok.char)}')`;
        case TokenType.Comment:     return `Comment("${tok.comment}")`;
        case TokenType.Integer:     return `Integer(${tok.value})`;
        case TokenType.Float:       return `Float(${tok.value})`;
        case TokenType.MacroBody:   return `MacroBody(${replaceBlanks(tok.body)})`;
        case TokenType.Symbol:      return `Symbol(${tok.name})`;
        case TokenType.String:      return `String("${tok.str}")`;
        case TokenType.Separator:   return `Separator('${replaceBlanks(tok.char)})`;
        case TokenType.EOL:         return `EOL('${replaceBlanks(tok.char)}')`;
        case TokenType.EOF:         return "EOF()";
    }
}
