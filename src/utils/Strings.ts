export function replaceBlanks(s: string): string {
    return s
        .replaceAll("\t", "<TAB>")
        .replaceAll("\r", "<CR>")
        .replaceAll("\n", "<LF>")
        .replaceAll("\f", "<FF>");
}

export function numToOctal(num: number, width: number): string {
    return num.toString(8).padStart(width, "0");
}

export function parseIntSafe(str: string, radix: 8 | 10 | 16): number {
    let allowed;
    switch (radix) {
        case 8:     allowed = /^[0-7]+$/; break;
        case 10:    allowed = /^[0-9]+$/; break;
        case 16:    allowed = /^[0-9A-Fa-f]+$/; break;
    }

    if (!str.match(allowed)) {
        throw Error(`Invalid symbols in number for radix ${radix}`);
    }

    return Number.parseInt(str, radix);
}
