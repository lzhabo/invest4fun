import { describe, expect, it } from "vitest";
import {
	INITIAL_CHART_PERIOD,
	chartPrefetchRequests,
} from "../src/client/chart-loading-policy.js";

describe("chart loading policy", () => {
	it("loads only one-month history before the user chooses another period", () => {
		expect(INITIAL_CHART_PERIOD).toBe("1M");
		expect(
			chartPrefetchRequests({
				visibleAssetId: "sol:mainnet:visible",
				nextAssetId: "sol:mainnet:next",
			}),
		).toEqual([
			{ assetId: "sol:mainnet:visible", period: "1M" },
			{ assetId: "sol:mainnet:next", period: "1M" },
		]);
	});

	it("does not duplicate a prefetch when there is no next card", () => {
		expect(
			chartPrefetchRequests({
				visibleAssetId: "sol:mainnet:visible",
			}),
		).toEqual([{ assetId: "sol:mainnet:visible", period: "1M" }]);
	});
});
