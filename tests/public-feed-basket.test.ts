import { describe, expect, it } from "vitest";

import {
	addPublicFeedBasketItem,
	consumePendingPublicFeedSelections,
	hasPendingPublicFeedRouteCheck,
	markPublicFeedRouteCheckPending,
	readPublicFeedBasket,
	removePublicFeedBasketItem,
} from "../src/client/public-feed-basket.js";

class MemoryStorage implements Storage {
	private readonly values = new Map<string, string>();

	get length() {
		return this.values.size;
	}

	clear() {
		this.values.clear();
	}

	getItem(key: string) {
		return this.values.get(key) ?? null;
	}

	key(index: number) {
		return [...this.values.keys()][index] ?? null;
	}

	removeItem(key: string) {
		this.values.delete(key);
	}

	setItem(key: string, value: string) {
		this.values.set(key, value);
	}
}

describe("public feed basket", () => {
	it("adds unique assets and updates an existing amount", () => {
		const storage = new MemoryStorage();
		addPublicFeedBasketItem(storage, "sol:mainnet:SOL", "1000000");
		addPublicFeedBasketItem(storage, "sol:mainnet:JUP", "2000000");
		addPublicFeedBasketItem(storage, "sol:mainnet:SOL", "3000000");

		expect(readPublicFeedBasket(storage)).toEqual([
			{ assetId: "sol:mainnet:SOL", amountInBaseUnits: "3000000" },
			{ assetId: "sol:mainnet:JUP", amountInBaseUnits: "2000000" },
		]);
	});

	it("removes an asset without changing the rest of the basket", () => {
		const storage = new MemoryStorage();
		addPublicFeedBasketItem(storage, "sol:mainnet:SOL", "1000000");
		addPublicFeedBasketItem(storage, "sol:mainnet:JUP", "2000000");

		removePublicFeedBasketItem(storage, "sol:mainnet:SOL");

		expect(readPublicFeedBasket(storage)).toEqual([
			{ assetId: "sol:mainnet:JUP", amountInBaseUnits: "2000000" },
		]);
	});

	it("hands a validated basket to route checking only after explicit intent", () => {
		const storage = new MemoryStorage();
		addPublicFeedBasketItem(storage, "sol:mainnet:SOL", "1000000");
		expect(hasPendingPublicFeedRouteCheck(storage)).toBe(false);
		expect(consumePendingPublicFeedSelections(storage)).toEqual([]);

		markPublicFeedRouteCheckPending(storage);
		expect(hasPendingPublicFeedRouteCheck(storage)).toBe(true);
		const selections = consumePendingPublicFeedSelections(storage);

		expect(selections).toHaveLength(1);
		expect(selections[0]?.candidate.assetId).toBe("sol:mainnet:SOL");
		expect(selections[0]?.amountInBaseUnits).toBe("1000000");
		expect(hasPendingPublicFeedRouteCheck(storage)).toBe(false);
		expect(consumePendingPublicFeedSelections(storage)).toEqual([]);
	});

	it("rejects unknown assets and malformed amounts from storage", () => {
		const storage = new MemoryStorage();
		storage.setItem(
			"investmade:public-feed-basket:v1",
			JSON.stringify([
				{ assetId: "sol:mainnet:SOL", amountInBaseUnits: "1000000" },
				{ assetId: "sol:mainnet:UNKNOWN", amountInBaseUnits: "1000000" },
				{ assetId: "sol:mainnet:JUP", amountInBaseUnits: "-1" },
			]),
		);

		expect(readPublicFeedBasket(storage)).toEqual([
			{ assetId: "sol:mainnet:SOL", amountInBaseUnits: "1000000" },
		]);
	});
});
