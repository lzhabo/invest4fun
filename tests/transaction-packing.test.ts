import { describe, expect, it } from "vitest";
import { minimumTransactionPacking } from "../src/server/transaction-packing.js";

describe("minimum transaction packing", () => {
	it("uses the fewest groups and keeps every asset exactly once", () => {
		const packing = minimumTransactionPacking(3, [
			{ mask: 0b001, serializedSize: 500 },
			{ mask: 0b010, serializedSize: 500 },
			{ mask: 0b100, serializedSize: 500 },
			{ mask: 0b011, serializedSize: 900 },
			{ mask: 0b101, serializedSize: 950 },
			{ mask: 0b110, serializedSize: 900 },
		]);

		expect(packing).toHaveLength(2);
		expect(packing?.reduce((combined, mask) => combined | mask, 0)).toBe(0b111);
		expect(packing?.reduce((combined, mask) => combined ^ mask, 0)).toBe(0b111);
	});

	it("prefers the safer balanced grouping when counts tie", () => {
		expect(
			minimumTransactionPacking(4, [
				{ mask: 0b0011, serializedSize: 1_200 },
				{ mask: 0b1100, serializedSize: 700 },
				{ mask: 0b0101, serializedSize: 950 },
				{ mask: 0b1010, serializedSize: 950 },
			]),
		).toEqual([0b0101, 0b1010]);
	});
});
