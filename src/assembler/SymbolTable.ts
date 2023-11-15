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
        const normName = normalizeSymbolName(name);
        if (this.symbols.has(normName)) {
            throw Error(`Redefining permanent symbol ${normName}`);
        }
        this.symbols.set(normName, { type: SymbolType.Permanent, name: normName, value: value });
    }

    public definePseudo(name: string) {
        const normName = normalizeSymbolName(name);
        if (this.symbols.has(normName)) {
            throw Error(`Redefining pseudo symbol ${normName}`);
        }
        this.symbols.set(normName, { type: SymbolType.Pseudo, name: normName });
    }

    public defineMacro(name: string) {
        const normName = normalizeSymbolName(name);
        if (this.symbols.has(normName)) {
            throw Error(`Redefining macro symbol ${normName}`);
        }
        this.symbols.set(normName, { type: SymbolType.Macro, name: normName });
    }

    public defineParameter(name: string, value: number) {
        const normName = normalizeSymbolName(name);
        const existing = this.symbols.get(normName);
        if (existing) {
            if (existing.type != SymbolType.Param && existing.type != SymbolType.Label) {
                throw Error(`Illegal redefine of ${existing.name}`);
            }

            const noChange = (existing.value == value);
            if (noChange) {
                // make sure we don't lose meta-information, e.g. FIXTAB only runs in pass 1,
                // so pass 2 will re-assign parameters but not fix them again
                return;
            }

            // redefining a symbol is completely okay, but warn if it changed despite being fixed
            if (existing.type == SymbolType.Param && existing.fixed) {
                // TODO: Generate warning
                existing.value = value;
                return;
            }
        }

        this.symbols.set(normName, {
            type: SymbolType.Param,
            name: normName,
            value: value,
            fixed: false,
            forcedMri: false,
        });
    }

    public defineForcedMri(name: string, value: number) {
        const normName = normalizeSymbolName(name);
        const existing = this.symbols.get(normName);
        if (existing) {
            if (existing.type != SymbolType.Param) {
                throw Error(`Illegal redefine of ${existing.name}`);
            }

            const noChange = (existing.value == value);
            if (!noChange) {
                throw Error(`Redefining MRI symbol ${normName}`);
            }
        }

        this.symbols.set(normName, {
            type: SymbolType.Param,
            name: normName,
            value: value,
            fixed: true,
            forcedMri: true,
        });
    }

    public defineLabel(label: string, clc: number) {
        const normName = normalizeSymbolName(label);
        const existing = this.symbols.get(normName);

        if (existing) {
            if (existing.type != SymbolType.Label && existing.type != SymbolType.Param) {
                throw Error(`Illegal redefine of label ${existing.name}`);
            }

            const noChange = (existing.value == clc);
            if (noChange) {
                // defining a parameter to export labels is okay if the label later gets the exported value
                return;
            }

            if (existing.type == SymbolType.Param) {
                // TODO: Generate warning
            } else {
                throw Error(`Redefining label ${normName}`);
            }
        }
        this.symbols.set(normName, { type: SymbolType.Label, name: normName, value: clc });
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
                sym.fixed = true;
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
}
