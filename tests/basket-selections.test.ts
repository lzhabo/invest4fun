import { describe, expect, it } from "vitest";
import { feedBasketSelections } from "../src/client/basket-selections.js";
import type { Candidate } from "../src/domain/schemas.js";

describe("feedBasketSelections", () => {
	it("builds one execution leg per selected feed asset", () => {
		const candidate: Candidate = {
			chain: "SOLANA",
			assetId: "sol:feed",
			symbol: "FEED",
			name: "Feed token",
			kind: "CRYPTO",
			contract: "sol:feed",
			decimals: 6,
			eligible: true,
			marketHealthy: true,
			permissionAllowed: true,
			reason: "test",
			crowdScoreBps: 5_000,
			evidenceIds: ["test"],
		};

		expect(feedBasketSelections([candidate], 0.1)).toEqual([
			{ candidate, amountInBaseUnits: "100000" },
		]);
	});
});
