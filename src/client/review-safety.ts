import { executionIntent } from "../domain/execution-intent.js";
import type {
	Candidate,
	ExecutionPlan,
	ExecutionRequest,
} from "../domain/schemas.js";

export interface ReviewExecutionRecord {
	plan: ExecutionPlan;
	status: "PREPARED" | "SUBMITTED" | "SETTLED" | "PARTIAL" | "FAILED";
	walletCalls?: Array<{
		transaction: { from: string };
	}>;
}

export interface ReviewBasket {
	sessionId: string;
	epochId: string;
	chain: "SOLANA";
	executionProvider: "JUPITER";
	selections: Array<{
		candidate: Candidate;
		amountInBaseUnits: string;
	}>;
	periodLimitUsd: number;
	wallet: string;
}

export function reviewBasketKey(basket: ReviewBasket) {
	return JSON.stringify({
		sessionId: basket.sessionId,
		epochId: basket.epochId,
		executionProvider: basket.executionProvider,
		chain: basket.chain,
		selections: basket.selections
			.map(({ candidate, amountInBaseUnits }) => ({
				assetId: candidate.assetId,
				amountInBaseUnits,
			}))
			.sort((left, right) => left.assetId.localeCompare(right.assetId)),
		periodLimitUsd: basket.periodLimitUsd,
		wallet: basket.wallet,
	});
}

export function executionMatchesReviewBasket(
	record: ReviewExecutionRecord | undefined,
	basket: ReviewBasket,
) {
	if (
		!record ||
		!basket.selections.length ||
		record.plan.sessionId !== basket.sessionId ||
		record.plan.epochId !== basket.epochId ||
		record.plan.provider !== basket.executionProvider
	) {
		return false;
	}
	const selectedIds = basket.selections
		.map(({ candidate }) => candidate.assetId)
		.sort();
	const quotedIds = record.plan.quotes
		.map((quote) => quote.assetId)
		.sort();
	if (
		selectedIds.length !== quotedIds.length ||
		selectedIds.some((assetId, index) => assetId !== quotedIds[index]) ||
		record.plan.quotes.some((quote) => {
			const selection = basket.selections.find(
				(item) => item.candidate.assetId === quote.assetId,
			);
			return !selection || quote.amountInBaseUnits !== selection.amountInBaseUnits;
		}) ||
		record.plan.totalInputBaseUnits !== basket.selections
			.reduce((sum, selection) => sum + BigInt(selection.amountInBaseUnits), 0n)
			.toString()
	) {
		return false;
	}
	return !record.walletCalls?.length;
}

export async function executionPlanHashMatchesReviewBasket(
	record: ReviewExecutionRecord,
	basket: ReviewBasket,
) {
	if (!basket.selections.length) return false;
	const request: ExecutionRequest = {
		sessionId: basket.sessionId,
		chain: "SOLANA",
		cluster: "mainnet-beta",
		inputToken: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
		periodLimitUsd: basket.periodLimitUsd,
		selections: basket.selections.map(({ candidate, amountInBaseUnits }) => ({
			assetId: candidate.assetId,
			amountInBaseUnits,
		})),
		slippageBps: 50,
	};
	const json = canonicalJson(
		executionIntent(
			{
				id: basket.sessionId,
				epochId: basket.epochId,
				executionProvider: basket.executionProvider,
				chain: basket.chain,
				wallet: basket.wallet,
			},
			request,
		),
	);
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(json),
	);
	const hash = Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
	return record.plan.authorizedPlanHash === `sha256:${hash}`;
}

function canonicalJson(value: unknown): string {
	return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.filter(([, item]) => item !== undefined)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, item]) => [key, canonicalize(item)]),
		);
	}
	return value;
}
