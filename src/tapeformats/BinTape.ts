export class BinTape {
    public static OriginFlag = 0o100;
    public static FieldFlags = 0o300;
    private data: number[] = [];
    private checksum = 0;

    public constructor() {
        this.writeLeader(2 * 12 * 10); // 2 feet = 12 inch of 10 byte each
    }

    public writeByte(byte: number, checked: boolean): void {
        const out = byte & 0xFF;
        if (checked) {
            this.checksum = (this.checksum + out) & 0xFFFF;
        }
        this.data.push(byte & 0xFF)
    }

    public writeWord(word: number, checked: boolean): void {
        this.writeByte(((word >> 6) & 0o077), checked);
        this.writeByte(word & 0o077, checked);
    }

    public writeLeader(count: number) {
        for (let i = 0; i < count; i++) {
            this.writeByte(0o200, false);
        }
    }

    public writeOrigin(clc: number): void {
        // write upper 6 bit + origin flag followed by lower 6 bit
        this.writeByte(((clc >> 6) & 0o077) | BinTape.OriginFlag, true);
        this.writeByte(clc & 0o077, true);
    }

    public writeField(field: number): void {
        this.writeByte(((field & 7) << 3) | BinTape.FieldFlags, false);
    }

    public finish(): Uint8Array {
        this.writeWord(this.checksum, false);
        this.writeLeader(1);
        return new Uint8Array(this.data);
    }
}
