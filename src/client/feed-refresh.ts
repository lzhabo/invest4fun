import type { FeedResponse } from "./api.js";

export function mergeRefreshedFeed(
	current: FeedResponse,
	refreshed: FeedResponse,
	selectedAssetIds: string[],
): FeedResponse {
	const currentCandidates = new Map(
		current.candidates.map((candidate) => [candidate.assetId, candidate]),
	);
	const currentCards = new Map(
		current.feed.cards.map((card) => [card.assetId, card]),
	);
	const selected = new Set(selectedAssetIds);
	const preservedCandidates = selectedAssetIds.flatMap(
		(assetId) => currentCandidates.get(assetId) ?? [],
	);
	const preservedCards = selectedAssetIds.flatMap(
		(assetId) => currentCards.get(assetId) ?? [],
	);
	const freshCandidates = refreshed.candidates.filter(
		(candidate) => !selected.has(candidate.assetId),
	);
	const freshCards = refreshed.feed.cards.filter(
		(card) => !selected.has(card.assetId),
	);
	const cards = [...preservedCards, ...freshCards].map((card, index) => ({
		...card,
		rank: index + 1,
	}));

	return {
		...refreshed,
		candidates: [...preservedCandidates, ...freshCandidates],
		feed: { ...refreshed.feed, cards },
		rankedAssetCount: Math.max(refreshed.rankedAssetCount, cards.length),
	};
}
