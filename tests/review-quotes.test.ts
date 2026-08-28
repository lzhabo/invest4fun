import { describe, expect, it } from "vitest";
import type { Quote } from "../src/domain/schemas.js";
import { reviewQuoteMap } from "../src/client/review-quotes.js";

const feedQuote: Quote = {
	requestId: "feed-quote",
	provider: "JUPITER",
	chain: "SOLANA",
	assetId: "asset-a",
	tokenOut: "Token1111111111111111111111111111111111111",
	amountInBaseUnits: "100000",
	estimatedAmountOut: "42000",
	minimumAmountOut: "41000",
	unitPriceUsd: "2.38",
	priceImpactBps: 12,
	routing: "JUPITER",
	quotedAt: "2026-08-28T15:00:00.000Z",
	expiresAt: "2026-08-28T15:05:00.000Z",
};

describe("review quote display", () => {
	it("keeps feed quote values visible when preparation has no record", () => {
		const quotes = reviewQuoteMap(undefined, [
			{ amountInBaseUnits: "100000", quote: feedQuote },
		]);

		expect(quotes.get("asset-a")).toMatchObject({
			estimatedAmountOut: "42000",
			minimumAmountOut: "41000",
			priceImpactBps: 12,
		});
	});

	it("prefers a freshly prepared quote over the feed quote", () => {
		const preparedQuote = {
			...feedQuote,
			requestId: "prepared-quote",
			estimatedAmountOut: "43000",
		};

		const quotes = reviewQuoteMap([preparedQuote], [
			{ amountInBaseUnits: "100000", quote: feedQuote },
		]);

		expect(quotes.get("asset-a")?.requestId).toBe("prepared-quote");
	});

	it("does not reuse a feed quote after the input amount changes", () => {
		const quotes = reviewQuoteMap(undefined, [
			{ amountInBaseUnits: "200000", quote: feedQuote },
		]);

		expect(quotes.has("asset-a")).toBe(false);
	});
});
