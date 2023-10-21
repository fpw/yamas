export enum SymbolType {
    Param,      // A=x
    Label,      // A,
    Pseudo,     // DECIMAL
    Fixed,      // Param after FIXTAB
    Permanent,  // I and Z
}

export interface DefinedSymbol {
    type: SymbolType;
    name: string;
    value?: number;
}

export class SymbolTable {
    private symbols: DefinedSymbol[] = [];

    public dump(): string {
        let str = "";
        for (const sym of this.symbols) {
            if (sym.type == SymbolType.Label || sym.type == SymbolType.Param) {
                str += `${sym.name} = ${sym.value?.toString(8)}\n`;
            }
        }
        return str;
    }

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
        });
    }

    public defineParameter(name: string, value: number) {
        this.defineSymbol({
            type: SymbolType.Param,
            name: name,
            value: value,
        });
    }

    public defineLabel(label: string, clc: number) {
        this.defineSymbol({
            type: SymbolType.Label,
            name: label,
            value: clc,
        });
    }

    public fix() {
        for (const sym of this.symbols) {
            if (sym.type == SymbolType.Param) {
                sym.type = SymbolType.Fixed;
            }
        }
    }

    public expunge() {
        this.symbols = this.symbols.filter(sym => sym.type == SymbolType.Permanent || sym.type == SymbolType.Pseudo);
    }

    private defineSymbol(data: DefinedSymbol): DefinedSymbol {
        const normName = this.normalizeName(data.name);
        const sym = this.lookup(normName);
        if (sym) {
            if (sym.type == SymbolType.Param && data.type == SymbolType.Param) {
                sym.value = data.value;
                return sym;
            } else {
                throw Error(`Duplicate symbol ${normName}`);
            }
        }

        const newSym: DefinedSymbol = {
            ...data,
            name: normName,
        };
        this.symbols.push(newSym);
        return newSym;
    }

    public lookup(name: string): DefinedSymbol | undefined {
        const normName = this.normalizeName(name);
        for (const sym of this.symbols) {
            if (sym.name == normName) {
                return sym;
            }
        }
    }

    private normalizeName(name: string) {
        return name.toLocaleUpperCase().substring(0, 6);
    }
}
