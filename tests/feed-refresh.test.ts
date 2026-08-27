import { describe, expect, it } from "vitest";
import type { Candidate } from "../src/domain/schemas.js";
import type { FeedResponse } from "../src/client/api.js";
import { mergeRefreshedFeed } from "../src/client/feed-refresh.js";

function candidate(assetId: string): Candidate {
	return { assetId } as Candidate;
}

function response(assetIds: string[]): FeedResponse {
	return {
		candidates: assetIds.map(candidate),
		feed: {
			cards: assetIds.map((assetId, index) => ({ assetId, rank: index + 1 })),
		} as FeedResponse["feed"],
		hasMore: true,
		rankedAssetCount: assetIds.length,
		proof: {} as FeedResponse["proof"],
	};
}

describe("feed refresh", () => {
	it("preserves the selected basket and replaces the remaining feed", () => {
		const merged = mergeRefreshedFeed(
			response(["selected", "old"]),
			response(["new", "selected", "another"]),
			["selected"],
		);

		expect(merged.candidates.map(({ assetId }) => assetId)).toEqual([
			"selected",
			"new",
			"another",
		]);
		expect(merged.feed.cards.map(({ assetId, rank }) => [assetId, rank])).toEqual(
			[
				["selected", 1],
				["new", 2],
				["another", 3],
			],
		);
	});
});
