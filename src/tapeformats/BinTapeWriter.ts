
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
        this.data.push(byte & 0xFF)
    }

    public finish(): Uint8Array {
        this.writeDataWord(this.checksum & 0o7777, false);
        this.writeLeader(1);
        return new Uint8Array(this.data);
    }
}
