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

import * as PDP8 from "../utils/PDP8.js";

export class Context {
    private radix_: 8 | 10 = 8;
    private field_ = 0;
    private reloc_ = 0;
    private punchEnabled_ = true;
    private readonly generateCode_: boolean;
    private clc = PDP8.firstAddrInPage(1);

    public constructor(generateCode: boolean) {
        this.generateCode_ = generateCode;
    }

    public get reloc() {
        return this.reloc_;
    }

    public set reloc(newReloc: number) {
        this.reloc_ = newReloc;
    }

    public get field() {
        return this.field_;
    }

    public set field(newField: number) {
        this.field_ = newField;
    }

    public get radix() {
        return this.radix_;
    }

    public set radix(r: 8 | 10) {
        this.radix_ = r;
    }

    public get punchEnabled() {
        return this.punchEnabled_;
    }

    public set punchEnabled(en: boolean) {
        this.punchEnabled_ = en;
    }

    public get generateCode() {
        return this.generateCode_;
    }

    public get doOutput() {
        return this.generateCode && this.punchEnabled;
    }

    public getClc(doReloc: boolean) {
        return (this.clc + (doReloc ? this.reloc : 0)) & 0o7777;
    }

    public setClc(clc: number, doReloc: boolean) {
        this.clc = (clc - (doReloc ? this.reloc : 0)) & 0o7777;
    }
}
