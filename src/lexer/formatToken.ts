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
