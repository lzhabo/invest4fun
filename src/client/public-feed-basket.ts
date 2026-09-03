import type { Candidate } from "../domain/schemas.js";
import { DEFAULT_PUBLIC_FEED_CANDIDATES } from "./public-feed.js";

export const PUBLIC_FEED_BASKET_KEY = "investmade:public-feed-basket:v1";
const PUBLIC_FEED_ROUTE_CHECK_KEY =
	"investmade:public-feed-route-check-pending:v1";

export interface PublicFeedBasketItem {
	assetId: string;
	amountInBaseUnits: string;
}

export interface PublicFeedSelection {
	candidate: Candidate;
	amountInBaseUnits: string;
}

const candidateById = new Map(
	DEFAULT_PUBLIC_FEED_CANDIDATES.map((candidate) => [
		candidate.assetId,
		candidate,
	]),
);

function validAmount(value: unknown): value is string {
	return typeof value === "string" && /^[1-9]\d*$/.test(value);
}

function normalizeBasket(value: unknown): PublicFeedBasketItem[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	return value.flatMap((item) => {
		if (!item || typeof item !== "object") return [];
		const assetId = "assetId" in item ? item.assetId : undefined;
		const amountInBaseUnits =
			"amountInBaseUnits" in item ? item.amountInBaseUnits : undefined;
		if (
			typeof assetId !== "string" ||
			!candidateById.has(assetId) ||
			seen.has(assetId) ||
			!validAmount(amountInBaseUnits)
		)
			return [];
		seen.add(assetId);
		return [{ assetId, amountInBaseUnits }];
	});
}

export function readPublicFeedBasket(storage: Storage): PublicFeedBasketItem[] {
	try {
		return normalizeBasket(
			JSON.parse(storage.getItem(PUBLIC_FEED_BASKET_KEY) ?? "[]"),
		);
	} catch {
		return [];
	}
}

function writePublicFeedBasket(
	storage: Storage,
	items: PublicFeedBasketItem[],
) {
	const normalized = normalizeBasket(items);
	try {
		storage.setItem(PUBLIC_FEED_BASKET_KEY, JSON.stringify(normalized));
	} catch {
		// The in-memory UI remains usable when browser storage is unavailable.
	}
	return normalized;
}

export function addPublicFeedBasketItem(
	storage: Storage,
	assetId: string,
	amountInBaseUnits: string,
) {
	const current = readPublicFeedBasket(storage);
	const existing = current.findIndex((item) => item.assetId === assetId);
	if (existing >= 0) current[existing] = { assetId, amountInBaseUnits };
	else current.push({ assetId, amountInBaseUnits });
	return writePublicFeedBasket(storage, current);
}

export function removePublicFeedBasketItem(storage: Storage, assetId: string) {
	return writePublicFeedBasket(
		storage,
		readPublicFeedBasket(storage).filter((item) => item.assetId !== assetId),
	);
}

export function publicFeedSelections(
	items: PublicFeedBasketItem[],
): PublicFeedSelection[] {
	return items.flatMap((item) => {
		const candidate = candidateById.get(item.assetId);
		return candidate ? [{ candidate, amountInBaseUnits: item.amountInBaseUnits }] : [];
	});
}

export function markPublicFeedRouteCheckPending(storage: Storage) {
	try {
		storage.setItem(PUBLIC_FEED_ROUTE_CHECK_KEY, "true");
	} catch {
		// The login still opens; a storage error only prevents automatic handoff.
	}
}

export function hasPendingPublicFeedRouteCheck(storage: Storage) {
	try {
		return storage.getItem(PUBLIC_FEED_ROUTE_CHECK_KEY) === "true";
	} catch {
		return false;
	}
}

export function consumePendingPublicFeedSelections(
	storage: Storage,
): PublicFeedSelection[] {
	try {
		if (storage.getItem(PUBLIC_FEED_ROUTE_CHECK_KEY) !== "true") return [];
		storage.removeItem(PUBLIC_FEED_ROUTE_CHECK_KEY);
		const selections = publicFeedSelections(readPublicFeedBasket(storage));
		storage.removeItem(PUBLIC_FEED_BASKET_KEY);
		return selections;
	} catch {
		return [];
	}
}
