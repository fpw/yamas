/* eslint-disable max-lines-per-function */
import { parseScientificFloat, scientificToDecimal, toDECFloat } from "../../src/utils/Floats.js";

describe("GIVEN a scientific float string", () => {
    const expectations: [
        string,
        ["+" | "-", string, string, "+" | "-", string],
        [bigint, bigint],
        [number, number, number]
    ][] = [
        ["0", ["+", "0", "0", "+", "0"], [0n, 0n], [0, 0, 0]],
        ["+509.32E-02", ["+", "509", "32", "-", "02"], [50932n, -4n], [0o0003, 0o2427, 0o6677]],
        ["-62.97E04", ["-", "62", "97", "+", "04"], [-6297n, 2n], [0o0024, 0o5462, 0o0740]],
        ["1.00E-2", ["+", "1", "00", "-", "2"], [1n, -2n], [0o7772, 0o2436, 0o5605]],
        ["0E0", ["+", "0", "0", "+", "0"], [0n, 0n], [0, 0, 0]],
        ["1.0", ["+", "1", "0", "+", "0"], [1n, 0n], [0o0001, 0o2000, 0o0000]],
        ["1.01", ["+", "1", "01", "+", "0"], [101n, -2n], [0o0001, 0o2012, 0o1727]],
        [".1", ["+", "0", "1", "+", "0"], [1n, -1n], [0o7775, 0o3146, 0o3146]],
        ["1.6", ["+", "1", "6", "+", "0"], [16n, -1n], [0o0001, 0o3146, 0o3146]],
    ];

    for (const [scientific, [sign, integral, decimal, expSign, exponent], [mantissa, decExp], float] of expectations) {
        describe(`WHEN parsing '${scientific}'`, () => {
            test(`THEN it should be parsed to [${sign}${integral}, ${decimal}, ${expSign}${exponent}]`, () => {
                const float = parseScientificFloat(scientific);
                expect(float.integralSign).toEqual(sign);
                expect(float.integral).toEqual(integral);
                expect(float.decimal).toEqual(decimal);
                expect(float.expoSign).toEqual(expSign);
                expect(float.exponent).toEqual(exponent);
            });

            test(`THEN it should be converted to ${mantissa} * 10^${decExp}`, () => {
                const sciFloat = scientificToDecimal({
                    integralSign: sign, integral,
                    decimal,
                    expoSign: expSign, exponent
                });
                expect(sciFloat.mantissa).toEqual(mantissa);
                expect(sciFloat.decExp).toEqual(decExp);

                const decFloat = toDECFloat(scientific);
                expect(decFloat).to.deep.equal(float);
            });
        });
    }
});
