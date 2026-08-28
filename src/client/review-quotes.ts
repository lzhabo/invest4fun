import type { Quote } from "../domain/schemas.js";

export function reviewQuoteMap(
	preparedQuotes: Quote[] | undefined,
	selections: Array<{
		amountInBaseUnits: string;
		quote?: Quote;
	}>,
) {
	const matchingFeedQuotes = selections.flatMap(({ amountInBaseUnits, quote }) =>
		quote?.amountInBaseUnits === amountInBaseUnits ? [quote] : [],
	);
	return new Map(
		[...matchingFeedQuotes, ...(preparedQuotes ?? [])].map((quote) => [
			quote.assetId,
			quote,
		]),
	);
}
