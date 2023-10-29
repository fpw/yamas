export function asciiCharTo7Bit(chr: string, markParity: boolean): number {
    const code = chr.codePointAt(0);
    if (code === undefined || code >= 0x80) {
        throw Error("Invalid 7-bit ASCII");
    }
    return code | (markParity ? 0o200 : 0);
}

export function asciiCharToDec(chr: string): number {
    const res = chr.charCodeAt(0) & 0o77;
    if (decCharToAscii(res) != chr) {
        throw Error("Character not in DEC charset");
    }
    return res;
}

export function decCharToAscii(chr: number): string {
    let ascii = chr;
    if (chr > 0 && chr <= 0o37) {
        ascii |= 0o100;
    }
    return String.fromCharCode(ascii);
}

// convert from ASCII string to DEC 6-bit string, i.e. result contains 12 bit words with 2 chars each
export function asciiStringToDec(text: string, terminate: boolean): number[] {
    const res: number[] = [];

    for (let i = 0; i < text.length; i += 2) {
        const left = asciiCharToDec(text[i]);
        let right = 0;
        if (i + 1 < text.length) {
            right = asciiCharToDec(text[i + 1]);
        }
        const word = (left << 6) | right;
        res.push(word);
    }

    // strings with odd lenghts have the lower character of the last word as 0
    // for even lenght strings, we need to append a whole word with two zero chars
    if (terminate && text.length % 2 == 0) {
        res.push(0); // in fact 12 bit with two zero chars
    }

    return res;
}

export function decStringToAscii(dec: number[]): string {
    let res = "";
    for (const w of dec) {
        const left = (w >> 6) & 0o77;
        const right = w & 0o77;
        if (left) {
            res += decCharToAscii(left);
        } else {
            break;
        }
        if (right) {
            res += decCharToAscii(right);
        } else {
            break;
        }
    }
    return res;
}

export function asciiStringToOS8Name(str: string): number[] {
    const [name, ext] = str.split(".");
    const namePart = name.padEnd(6, "\0");

    let extPart;
    if (ext) {
        extPart = ext.padEnd(2, "\0");
    } else {
        extPart = "\0\0";
    }

    return [
        ...asciiStringToDec(namePart, false),
        ...asciiStringToDec(extPart, false),
    ];
}

export function os8NameToASCII(os8Name: number[]): string {
    if (os8Name.length != 4) {
        throw Error(`Invalid length for OS/8 name: ${os8Name.length}`);
    }
    const namePart = decStringToAscii([os8Name[0], os8Name[1], os8Name[2]]);
    const extPart = decStringToAscii([os8Name[3]]);
    if (extPart) {
        return `${namePart}.${extPart}`;
    } else {
        return `${namePart}`;
    }
}
