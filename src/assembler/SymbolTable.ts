export enum SymbolType {
    Param,      // A=x
    Label,      // A,
    Pseudo,     // DECIMAL
    Fixed,      // Param after FIXTAB
    Permanent,  // I and Z
    Macro,
}

export interface DefinedSymbol {
    type: SymbolType;
    name: string;
    value: number;
}

export class SymbolTable {
    private symbols: DefinedSymbol[] = [];

    public dump(): string {
        let str = "";
        for (const sym of this.symbols.sort((a, b) => a.name.localeCompare(b.name))) {
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
        const sym = this.tryLookup(normName);

        if (sym) {
            // check if duplicates are okay
            const isParamRedefine =
                (sym.type == SymbolType.Param || sym.type == SymbolType.Fixed) &&
                data.type == SymbolType.Param;
            const isLabelCheck =
                (sym.type == SymbolType.Param || sym.type == SymbolType.Label) &&
                (data.type == SymbolType.Label && sym.value == data.value);

            if (isParamRedefine || isLabelCheck) {
                sym.value = data.value;
                return sym;
            } else {
                throw Error(`Duplicate symbol ${normName}, old: ${sym.value}, new: ${data.value}`);
            }
        }

        const newSym: DefinedSymbol = {
            ...data,
            name: normName,
        };
        this.symbols.push(newSym);
        return newSym;
    }

    public tryLookup(name: string): DefinedSymbol | undefined {
        const normName = this.normalizeName(name);
        for (const sym of this.symbols) {
            if (sym.name == normName) {
                return sym;
            }
        }
        return undefined;
    }

    public lookup(name: string): DefinedSymbol {
        const sym = this.tryLookup(name);
        if (sym === undefined) {
            throw Error(`Symbol ${name} not defined`);
        }
        return sym;
    }

    private normalizeName(name: string) {
        return name.toLocaleUpperCase().substring(0, 6);
    }
}
