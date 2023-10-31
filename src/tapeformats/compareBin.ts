import { MemSize } from "../utils/PDP8.js";
import { numToOctal } from "../utils/Strings.js";
import { BinTapeReader } from "./BinTapeReader.js";

export function compareBin(name: string, ours: Uint8Array, other: Uint8Array): boolean {
    const ourState = new BinTapeReader(ours).read();
    const otherState = new BinTapeReader(other).read();
    let good = true;

    for (let i = 0; i < MemSize; i++) {
        if (ourState[i] !== otherState[i]) {
            good = false;
            const addrStr = numToOctal(i, 5);
            const ourStr = ourState[i] !== undefined ? numToOctal(ourState[i]!, 4) : "null";
            const otherStr = otherState[i] !== undefined ? numToOctal(otherState[i]!, 4) : "null";
            console.log(`${addrStr}: our ${ourStr} != other ${otherStr} in ${name}`);
        }
    }

    return good;
}
