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

import { normalizeSymbolName } from "../utils/Strings.js";
import { SymbolData, SymbolType } from "./SymbolData.js";

export class SymbolTable {
    private symbols = new Map<string, SymbolData>();

    public definePermanent(name: string, value: number) {
        this.defineSymbol({
            type: SymbolType.Permanent,
            name: name,
            value: value,
        });
    }

    public definePseudo(name: string) {
        this.defineSymbol({
            type: SymbolType.Pseudo,
            name: name,
            value: 0,
        });
    }

    public defineParameter(name: string, value: number) {
        this.defineSymbol({
            type: SymbolType.Param,
            name: name,
            value: value,
        });
    }

    public defineForcedMri(name: string, value: number) {
        this.defineSymbol({
            type: SymbolType.Fixed,
            name: name,
            value: value,
            forceMri: true,
        });
    }

    public defineLabel(label: string, clc: number) {
        this.defineSymbol({
            type: SymbolType.Label,
            name: label,
            value: clc,
        });
    }

    public defineMacro(name: string) {
        this.defineSymbol({
            type: SymbolType.Macro,
            name: name,
            value: 0,
        });
    }

    public tryLookup(name: string): SymbolData | undefined {
        const normName = normalizeSymbolName(name);
        return this.symbols.get(normName);
    }

    public lookup(name: string): SymbolData {
        const sym = this.tryLookup(name);
        if (sym === undefined) {
            throw Error(`Symbol ${name} not defined`);
        }
        return sym;
    }

    public fix() {
        for (const sym of this.symbols.values()) {
            if (sym.type == SymbolType.Param) {
                sym.type = SymbolType.Fixed;
            }
        }
    }

    public expunge() {
        for (const [name, sym] of this.symbols) {
            if (sym.type != SymbolType.Permanent && sym.type != SymbolType.Pseudo) {
                this.symbols.delete(name);
            }
        }
    }

    public getSymbols(): ReadonlyMap<string, SymbolData> {
        return this.symbols;
    }

    private defineSymbol(data: SymbolData) {
        const normName = normalizeSymbolName(data.name);
        const sym = this.tryLookup(normName);

        if (sym) {
            // redfining a param is okay
            const isParamRedefine =
                (sym.type == SymbolType.Param || sym.type == SymbolType.Fixed) &&
                (data.type == SymbolType.Param || sym.forceMri);

            // some programs set locations as a param and still use a label later
            // this is only okay if they actually have the same value
            const isLabelCheck =
                (sym.type == SymbolType.Param || sym.type == SymbolType.Label) &&
                (data.type == SymbolType.Label && sym.value == data.value);

            // TODO: Generate warning
            const isFixRedefine =
                    (sym.type == SymbolType.Fixed &&
                    (data.type == SymbolType.Param || data.type == SymbolType.Label));

            if (isParamRedefine || isLabelCheck || isFixRedefine) {
                sym.value = data.value;
                return;
            } else {
                throw Error(`Duplicate symbol ${normName}, old: ${sym.value}, new: ${data.value}`);
            }
        }

        this.symbols.set(normName, { ...data, name: normName });
    }
}
