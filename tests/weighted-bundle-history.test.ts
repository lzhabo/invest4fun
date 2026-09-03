import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/client/api.js";
import { weightedBundleHistory } from "../src/client/weighted-bundle-history.js";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("weighted portfolio history", () => {
	it("returns unavailable unless every holding has real history", async () => {
		vi.spyOn(api, "assetHistory").mockImplementation(async (assetId) => ({
			period: "1M",
			source: assetId === "real" ? "coingecko" : "demo",
			points: [
				{ timestamp: 1, price: 10 },
				{ timestamp: 2, price: 11 },
			],
		}));
		const history = await weightedBundleHistory(
			[
				{ assetId: "real", weightBps: 5000 },
				{ assetId: "demo", weightBps: 5000 },
			],
			"1M",
		);
		expect(history).toMatchObject({ source: "unavailable", points: [] });
	});

	it("builds a weighted index only from complete real histories", async () => {
		vi.spyOn(api, "assetHistory").mockImplementation(async (assetId) => ({
			period: "1M",
			source: "coingecko",
			points:
				assetId === "up"
					? [
							{ timestamp: 1, price: 10 },
							{ timestamp: 2, price: 20 },
						]
					: [
							{ timestamp: 1, price: 10 },
							{ timestamp: 2, price: 10 },
						],
		}));
		const history = await weightedBundleHistory(
			[
				{ assetId: "up", weightBps: 5000 },
				{ assetId: "flat", weightBps: 5000 },
			],
			"1M",
		);
		expect(history.points[0]?.price).toBe(100);
		expect(history.points.at(-1)?.price).toBe(150);
	});

	it("rejects zero-priced series even when the provider label is real", async () => {
		vi.spyOn(api, "assetHistory").mockResolvedValue({
			period: "1M",
			source: "coingecko",
			points: [
				{ timestamp: 1, price: 10 },
				{ timestamp: 2, price: 0 },
			],
		});
		const history = await weightedBundleHistory(
			[{ assetId: "broken", weightBps: 10_000 }],
			"1M",
		);
		expect(history).toMatchObject({ source: "unavailable", points: [] });
	});
});
