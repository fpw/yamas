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

import * as Nodes from "../../parser/nodes/Node.js";
import { Context } from "../Context.js";

export type StatementHandler<T extends Nodes.Node> = (ctx: Context, stmt: T) => StatementEffect;
export type RegisterFunction =  <T extends Nodes.Statement>(type: T["type"], handler: StatementHandler<T>) => void;

export interface StatementEffect {
    // punch values (and implicitly increase CLC by the number of entries)
    output?: number[];

    // set CLC to new value with relocation
    setOrigin?: number;

    // change current field
    changeField?: number;

    // assembler and execute a sub-program
    assembleSubProgram?: Nodes.Program;

    // change radix for literal parsing
    setRadix?: 8 | 10;

    // set enable or disable output punching
    setPunchEnable?: boolean;

    // set relocation base
    setReloc?: number;
}
