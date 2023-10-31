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

import { BinTapeWriter } from "./BinTapeWriter.js";

enum BinSymType {
    Checksum,
    Origin,
    Field,
    Data,
}

interface BinSym {
    type: BinSymType;
    width: number;
    sum: number;
    data: number;
}

export class BinTapeReader {
    private input: Uint8Array;
    private mem: number[] = [];
    private offset = 0;
    private field = 0;
    private addr = 0;
    private sum = 0;

    public constructor(input: Uint8Array) {
        this.input = input;
    }

    public read(): (number | undefined)[] {
        this.initReading();

        while (this.offset < this.input.length) {
            const sym = this.nextSymbol();
            this.offset += sym.width;
            this.sum = (this.sum + sym.sum) & 0o7777;

            switch (sym.type) {
                case BinSymType.Checksum:
                    if (sym.data != this.sum) {
                        throw Error("Invalid checksum");
                    }
                    // there could be another binloader tape appended, continue
                    this.initReading();
                    break;
                case BinSymType.Origin:
                    this.addr = sym.data;
                    break;
                case BinSymType.Field:
                    this.field = sym.data;
                    break;
                case BinSymType.Data:
                    this.mem[this.field * 4096 + this.addr] = sym.data;
                    this.addr = (this.addr + 1) & 0o7777;
                    break;
            }
        }

        return this.mem;
    }

    private initReading() {
        let i = this.offset;
        for (; i < this.input.length; i++) {
            if (this.input[i] != 0 && this.input[i] != BinTapeWriter.Leader) {
                break;
            }
        }

        this.offset = i;
        this.addr = 0;
        this.field = 0;
        this.sum = 0;
    }

    private nextSymbol(): BinSym {
        const high = this.input[this.offset];

        if ((high & BinTapeWriter.OriginFlag) && (high & BinTapeWriter.FieldFlag)) {
            return {
                type: BinSymType.Field,
                width: 1,
                data: (high & 0o070) >> 3,
                sum: 0,
            };
        }

        const low = this.input[this.offset + 1];
        const word = ((high << 6) | low) & 0o7777;

        if (this.input[this.offset + 2] == BinTapeWriter.Leader) {
            return {
                type: BinSymType.Checksum,
                data: word,
                width: 3,
                sum: 0,
            };
        }

        return {
            type: high & BinTapeWriter.OriginFlag ? BinSymType.Origin : BinSymType.Data,
            width: 2,
            data: word,
            sum: low + high,
        };
    }
}
