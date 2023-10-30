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

export class BinTapeWriter {
    public static Leader = 0x80;
    public static OriginFlag = 0o100;
    public static FieldFlag = 0o200;

    private data: number[] = [];
    private checksum = 0;

    public constructor() {
        this.writeLeader(2 * 12 * 10); // 2 feet = 12 inch of 10 byte each
    }

    public writeDataWord(word: number, checked: boolean): void {
        this.writeByte(((word >> 6) & 0o077), checked);
        this.writeByte(word & 0o077, checked);
    }

    public writeOrigin(clc: number): void {
        // write upper 6 bit + origin flag followed by lower 6 bit
        this.writeByte(((clc >> 6) & 0o077) | BinTapeWriter.OriginFlag, true);
        this.writeByte(clc & 0o077, true);
    }

    public writeField(field: number): void {
        this.writeByte(((field & 7) << 3) | BinTapeWriter.OriginFlag | BinTapeWriter.FieldFlag, false);
    }

    private writeLeader(count: number) {
        for (let i = 0; i < count; i++) {
            this.writeByte(BinTapeWriter.Leader, false);
        }
    }

    private writeByte(byte: number, checked: boolean): void {
        const out = byte & 0xFF;
        if (checked) {
            this.checksum += out;
        }
        this.data.push(byte & 0xFF);
    }

    public finish(): Uint8Array {
        this.writeDataWord(this.checksum & 0o7777, false);
        this.writeLeader(1);
        return new Uint8Array(this.data);
    }
}
