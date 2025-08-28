/* eslint-disable max-lines-per-function */

import { encodeDECFloat } from "../../src/utils/float/DECFloat.js";
import { scientificToDecimal } from "../../src/utils/float/DecimalFloat.js";
import { parseScientificFloat } from "../../src/utils/float/ScientificFloat.js";

describe("GIVEN a scientific float string", () => {
    const expectations: [
        string,
        [bigint, string, bigint],
        [bigint, bigint],
        [number, number, number]
    ][] = [
        ["0", [0n, "0", 0n], [0n, 0n], [0, 0, 0]],
        ["+509.32E-02", [509n, "32", -2n], [50932n, -4n], [0o0003, 0o2427, 0o6677]],
        ["-62.97E04", [-62n, "97", 4n], [-6297n, 2n], [0o0024, 0o5462, 0o0740]],
        ["1.00E-2", [1n, "00", -2n], [1n, -2n], [0o7772, 0o2436, 0o5605]],
        ["0E0", [0n, "0", 0n], [0n, 0n], [0, 0, 0]],
        ["1.0", [1n, "0", 0n], [1n, 0n], [0o0001, 0o2000, 0o0000]],
        ["1.01", [1n, "01", 0n], [101n, -2n], [0o0001, 0o2012, 0o1727]],
        [".1", [0n, "1", 0n], [1n, -1n], [0o7775, 0o3146, 0o3146]],
        ["1.6", [1n, "6", 0n], [16n, -1n], [0o0001, 0o3146, 0o3146]],
    ];

    for (const [scientific, [integral, decimal, exponent], [mantissa, decExp], float] of expectations) {
        describe(`WHEN parsing '${scientific}'`, () => {
            test(`THEN it should be parsed to [${integral}, ${decimal}, ${exponent}]`, () => {
                const float = parseScientificFloat(scientific);
                expect(float.integral).toEqual(integral);
                expect(float.decimal).toEqual(decimal);
                expect(float.exponent).toEqual(exponent);
            });

            test(`THEN it should be converted to ${mantissa} * 10^${decExp}`, () => {
                const sciFloat = scientificToDecimal({
                    integral,
                    decimal,
                    exponent
                });
                expect(sciFloat.mantissa).toEqual(mantissa);
                expect(sciFloat.decExp).toEqual(decExp);

                const decFloat = encodeDECFloat(scientific);
                expect(decFloat).to.deep.equal(float);
            });
        });
    }
});
