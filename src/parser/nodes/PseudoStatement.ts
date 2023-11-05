import { DataStatement } from "./DataStatement.js";
import { MacroStatement } from "./MacroStatement.js";
import { Expression } from "./Expression.js";
import { AssignStatement } from "./Statement.js";
import { BaseNode, NodeType } from "./Node.js";
import { StringToken, SymbolToken } from "../../lexer/Token.js";

export type PseudoStatement =
    DataStatement | MacroStatement |
    EjectStatement | FixMriStatement | XListStatement | PauseStatement |
    RadixStatement | PunchCtrlStatement | FixTabStatement | ExpungeStatement |
    ChangeFieldStatement | ChangePageStatement | RelocStatement;

// OCTAL, DECIMAL
export interface RadixStatement extends BaseNode {
    type: NodeType.Radix;
    radix: 8 | 10;
    token: SymbolToken; // on OCTAL / DECIMAL
}

// FIELD
export interface ChangeFieldStatement extends BaseNode {
    type: NodeType.ChangeField;
    expr: Expression;
    token: SymbolToken; // on FIELD
}

// PAGE
export interface ChangePageStatement extends BaseNode {
    type: NodeType.ChangePage;
    expr?: Expression;
    token: SymbolToken; // on PAGE
}

// RELOC
export interface RelocStatement extends BaseNode {
    type: NodeType.Reloc;
    expr?: Expression;
    token: SymbolToken; // on RELOC
}

// FIXMRI
export interface FixMriStatement extends BaseNode {
    type: NodeType.FixMri;
    assignment: AssignStatement;
    token: SymbolToken; // on FIXMRI
}

// FIXTAB
export interface FixTabStatement extends BaseNode {
    type: NodeType.FixTab;
    token: SymbolToken;
}

// EXPUNGE
export interface ExpungeStatement extends BaseNode {
    type: NodeType.Expunge;
    token: SymbolToken;
}

// EJECT
export interface EjectStatement extends BaseNode {
    type: NodeType.Eject;
    text?: string;

    str?: StringToken;
    token: SymbolToken;
}

// ENPUNCH, NOPUNCH
export interface PunchCtrlStatement extends BaseNode {
    type: NodeType.PunchControl;
    enable: boolean;
    token: SymbolToken; // on ENPUNCH / NOPUNCH
}

// XLIST
export interface XListStatement extends BaseNode {
    type: NodeType.XList;
    token: SymbolToken; // on XLIST
}

// PAUSE
export interface PauseStatement extends BaseNode {
    type: NodeType.Pause;
    token: SymbolToken; // on PAUSE
}
