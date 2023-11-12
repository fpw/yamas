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

export enum SymbolType {
    Pseudo,     // PAGE, DECIMAL, ...
    Permanent,  // I and Z
    Macro,      // DEFINE
    Label,      // A,
    Param,      // A=x
}

export type SymbolData = PermanentSymbol | PseudoSymbol | MacroSymbol | LabelSymbol | ParamSymbol;

export interface BaseSymbol {
    readonly type: SymbolType;
    readonly name: string;
}

export interface PseudoSymbol extends BaseSymbol {
    type: SymbolType.Pseudo;
}

export interface PermanentSymbol extends BaseSymbol {
    type: SymbolType.Permanent;
    value: number;
}

export interface MacroSymbol extends BaseSymbol {
    type: SymbolType.Macro;
}

export interface LabelSymbol extends BaseSymbol {
    type: SymbolType.Label;
    value: number;
}

export interface ParamSymbol extends BaseSymbol {
    type: SymbolType.Param;
    value: number;

    // whether the symbol was fixed using FIXTAB or FIXMRI
    // only effect: do not output in symbol listing
    fixed: boolean;

    // whether the symbol is a forced MRI (FIXMRI)
    forcedMri: boolean;
}
