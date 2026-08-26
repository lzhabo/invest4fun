import { describe, expect, it } from "vitest";
import { parseCardAmountInput } from "../src/client/card-amount.js";

describe("card amount input", () => {
	it.each([
		["0.1", 0.1],
		["0,1", 0.1],
		["100", 100],
		["1000", 1000],
	])("parses %s", (input, expected) => {
		expect(parseCardAmountInput(input)).toBe(expected);
	});

	it.each(["", "0", "0.001", "10,2.3", "text"])(
		"rejects %s",
		(input) => {
			expect(parseCardAmountInput(input)).toBeUndefined();
		},
	);
});
