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
    private generateCode_: boolean;
    private clc = PDP8.firstAddrInPage(1);

    public constructor(generateCode: boolean) {
        this.generateCode_ = generateCode;
    }

    public get reloc() {
        return this.reloc_;
    }

    public get field() {
        return this.field_;
    }

    public get radix() {
        return this.radix_;
    }

    public get punchEnabled() {
        return this.punchEnabled_;
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

    public clone(): Context {
        const newCtx = new Context(this.generateCode_);
        newCtx.radix_ = this.radix_;
        newCtx.field_ = this.field_;
        newCtx.reloc_ = this.reloc_;
        newCtx.punchEnabled_ = this.punchEnabled_;
        newCtx.clc = this.clc;
        return newCtx;
    }

    public withRadix(newRadix: 8 | 10): Context {
        const newCtx = this.clone();
        newCtx.radix_ = newRadix;
        return newCtx;
    }

    public withPunchEnable(enable: boolean): Context {
        const newCtx = this.clone();
        newCtx.punchEnabled_ = enable;
        return newCtx;
    }

    public withCLC(newClc: number, doReloc: boolean): Context {
        const newCtx = this.clone();
        newCtx.clc = (newClc - (doReloc ? newCtx.reloc_ : 0)) & 0o7777;
        return newCtx;
    }

    public withField(newField: number): Context {
        const newCtx = this.clone();
        newCtx.field_ = newField;
        return newCtx;
    }

    public withReloc(reloc: number): Context {
        const newCtx = this.clone();
        newCtx.reloc_ = reloc;
        return newCtx;
    }
}
