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

import { replaceNonPrints } from "../utils/Strings.js";
import { Token, TokenType } from "./Token.js";

export function tokenToString(tok: Token): string {
    switch (tok.type) {
        case TokenType.Blank:       return `Blank('${replaceNonPrints(tok.char)}')`;
        case TokenType.Char:        return `Char('${replaceNonPrints(tok.char)}')`;
        case TokenType.ASCII:       return `ASCII('${replaceNonPrints(tok.char)}')`;
        case TokenType.Comment:     return `Comment("${replaceNonPrints(tok.comment)}")`;
        case TokenType.Integer:     return `Integer(${tok.value})`;
        case TokenType.Float:       return `Float(${tok.value})`;
        case TokenType.MacroBody:   return `MacroBody(${replaceNonPrints(tok.body)})`;
        case TokenType.Symbol:      return `Symbol(${tok.name})`;
        case TokenType.String:      return `String("${replaceNonPrints(tok.str)}")`;
        case TokenType.Separator:   return `Separator('${replaceNonPrints(tok.char)})`;
        case TokenType.EOL:         return `EOL('${replaceNonPrints(tok.char)}')`;
        case TokenType.EOF:         return "EOF()";
    }
}
