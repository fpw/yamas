export enum SymbolType {
    Param,      // A=x
    Label,      // A,
    Pseudo,     // PAGE, DECIMAL, ...
    Fixed,      // Converted from param using FIXTAB. Means no output in symbol table.
    Permanent,  // I and Z
    Macro,      // DEFINE
}

export interface SymbolData {
    type: SymbolType;
    name: string;
    value: number;
    forceMri?: boolean;
}
