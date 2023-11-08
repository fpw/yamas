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

import { DataStatement } from "./DataStatement.js";
import { Expression } from "./Expression.js";
import { MacroStatement } from "./MacroStatement.js";
import { BaseNode, NodeType } from "./Node.js";
import { AssignStatement } from "./Statement.js";

export type PseudoStatement =
    DataStatement | MacroStatement |
    EjectStatement | FixMriStatement | XListStatement | PauseStatement |
    RadixStatement | PunchCtrlStatement | FixTabStatement | ExpungeStatement |
    ChangeFieldStatement | ChangePageStatement | RelocStatement;

// OCTAL, DECIMAL
export interface RadixStatement extends BaseNode {
    type: NodeType.Radix;
    radix: 8 | 10;
}

// FIELD
export interface ChangeFieldStatement extends BaseNode {
    type: NodeType.ChangeField;
    expr: Expression;
}

// PAGE
export interface ChangePageStatement extends BaseNode {
    type: NodeType.ChangePage;
    expr?: Expression;
}

// RELOC
export interface RelocStatement extends BaseNode {
    type: NodeType.Reloc;
    expr?: Expression;
}

// FIXMRI
export interface FixMriStatement extends BaseNode {
    type: NodeType.FixMri;
    assignment: AssignStatement;
}

// FIXTAB
export interface FixTabStatement extends BaseNode {
    type: NodeType.FixTab;
}

// EXPUNGE
export interface ExpungeStatement extends BaseNode {
    type: NodeType.Expunge;
}

// EJECT
export interface EjectStatement extends BaseNode {
    type: NodeType.Eject;
    text?: string;
}

// ENPUNCH, NOPUNCH
export interface PunchCtrlStatement extends BaseNode {
    type: NodeType.PunchControl;
    enable: boolean;
}

// XLIST
export interface XListStatement extends BaseNode {
    type: NodeType.XList;
}

// PAUSE
export interface PauseStatement extends BaseNode {
    type: NodeType.Pause;
}
