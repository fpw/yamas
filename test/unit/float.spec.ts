/* eslint-disable max-lines-per-function */
import { encodeDECFloat } from "../../src/utils/float/DECFloat.js";
import { scientificToDecimal } from "../../src/utils/float/DecimalFloat.js";
import { parseScientificFloat } from "../../src/utils/float/ScientificFloat.js";

describe("GIVEN a scientific float string", () => {
    const expectations: [
        string,
        [-1n | 1n, bigint, bigint[], bigint],
        [bigint, bigint],
        [number, number, number]
    ][] = [
        // Input        ScientificFloat             DecimalFloat    DEC Float
        ["0",           [1n, 0n, [], 0n],           [0n, 0n],       [0o0000, 0o0000, 0o0000]],
        ["+509.32E-02", [1n, 509n, [3n, 2n], -2n],  [50932n, -4n],  [0o0003, 0o2427, 0o6677]],
        ["-62.97E04",   [-1n, 62n, [9n, 7n], 4n],   [-6297n, 2n],   [0o0024, 0o5462, 0o0740]],
        ["1.00E-2",     [1n, 1n, [0n, 0n], -2n],    [1n, -2n],      [0o7772, 0o2436, 0o5605]],
        ["0E0",         [1n, 0n, [], 0n],           [0n, 0n],       [0o0000, 0o0000, 0o0000]],
        ["1.0",         [1n, 1n, [0n], 0n],         [1n, 0n],       [0o0001, 0o2000, 0o0000]],
        ["1.01",        [1n, 1n, [0n, 1n], 0n],     [101n, -2n],    [0o0001, 0o2012, 0o1727]],
        [".1",          [1n, 0n, [1n], 0n],         [1n, -1n],      [0o7775, 0o3146, 0o3146]],
        ["-.1",         [-1n, 0n, [1n], 0n],        [-1n, -1n],     [0o7775, 0o4631, 0o4632]],
        ["1.6",         [1n, 1n, [6n], 0n],         [16n, -1n],     [0o0001, 0o3146, 0o3146]],
    ];

    for (const [scientific, [sign, integral, decimalDigits, exponent], [mantissa, decExp], float] of expectations) {
        describe(`WHEN parsing '${scientific}'`, () => {
            test(`THEN it should be parsed to [${integral}, ${decimalDigits}, ${exponent}]`, () => {
                const sciFloat = parseScientificFloat(scientific);
                expect(sciFloat.sign).toEqual(sign);
                expect(sciFloat.integral).toEqual(integral);
                expect(sciFloat.decimalDigits).to.deep.equal(decimalDigits);
                expect(sciFloat.exponent).toEqual(exponent);
            });

            test(`THEN it should be converted to ${mantissa} * 10^${decExp}`, () => {
                const decimalFloat = scientificToDecimal({
                    sign,
                    integral,
                    decimalDigits,
                    exponent
                });
                expect(decimalFloat.mantissa).toEqual(mantissa);
                expect(decimalFloat.decExp).toEqual(decExp);

                const decFloat = encodeDECFloat(scientific);
                expect(decFloat).to.deep.equal(float);
            });
        });
    }
});
