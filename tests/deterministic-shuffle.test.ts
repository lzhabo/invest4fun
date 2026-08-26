import { describe, expect, it } from "vitest";
import { deterministicShuffle } from "../src/domain/deterministic-shuffle.js";

describe("deterministicShuffle", () => {
	const cards = ["a", "b", "c", "d", "e", "f"];

	it("returns the same random-looking order for the same seed", () => {
		const first = deterministicShuffle(cards, "wallet:week:feed");
		const second = deterministicShuffle(cards, "wallet:week:feed");

		expect(first).toEqual(second);
		expect(first).not.toEqual(cards);
	});

	it("changes the order when the seed changes", () => {
		expect(deterministicShuffle(cards, "wallet-a:week:feed")).not.toEqual(
			deterministicShuffle(cards, "wallet-b:week:feed"),
		);
	});

	it("does not mutate the catalog", () => {
		const original = [...cards];
		deterministicShuffle(cards, "wallet:week:ideas");
		expect(cards).toEqual(original);
	});
});
