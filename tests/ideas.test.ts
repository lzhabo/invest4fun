import { describe, expect, it } from "vitest";
import {
	allocateWeightedCents,
	bundleExecutionLegs,
	IDEA_BUNDLES,
	MICRO_IDEA_AMOUNT_CENTS,
	minimumWeightedAmountCents,
	resolveMicroBundleHoldings,
} from "../src/domain/ideas.js";
import type { Candidate } from "../src/domain/schemas.js";

const candidate = (assetId: string): Candidate =>
	({
		assetId,
		symbol: assetId,
		name: assetId,
		kind: "CRYPTO",
		chain: "SOLANA",
		contract: "11111111111111111111111111111111",
		decimals: 9,
		eligible: true,
		marketHealthy: true,
		permissionAllowed: true,
		crowdScoreBps: 5000,
		reason: "test",
		evidenceIds: ["test"],
	}) as Candidate;

describe("integer portfolio allocation", () => {
	it("keeps the original Ideas cards in their established order", () => {
		expect(IDEA_BUNDLES.map((bundle) => bundle.id)).toEqual([
			"war-mode",
			"ai-leaders-portfolio",
			"capitol-gains",
			"solana-infrastructure",
		]);
	});

	it("sets every Ideas card minimum to one USDC", () => {
		expect(
			IDEA_BUNDLES.every(
				(bundle) => bundle.minimumInvestmentCents === MICRO_IDEA_AMOUNT_CENTS,
			),
		).toBe(true);
	});

	it("builds stable micro compositions that can execute for one USDC", () => {
		const bundle = IDEA_BUNDLES[0];
		if (!bundle) throw new Error("Missing test bundle");
		const holdings = resolveMicroBundleHoldings(
			bundle,
			bundle.holdings.map((holding) => candidate(holding.assetId)),
		);
		expect(holdings).toHaveLength(5);
		expect(holdings.map((holding) => holding.candidate.assetId)).toEqual(
			bundle.holdings.slice(0, 5).map((holding) => holding.assetId),
		);
		expect(holdings.reduce((sum, holding) => sum + holding.weightBps, 0)).toBe(
			10_000,
		);
		for (const idea of IDEA_BUNDLES) {
			const micro = resolveMicroBundleHoldings(
				idea,
				idea.holdings.map((holding) => candidate(holding.assetId)),
			);
			expect(micro).toHaveLength(5);
			expect(micro.reduce((sum, holding) => sum + holding.weightBps, 0)).toBe(
				10_000,
			);
			expect(
				allocateWeightedCents(
					MICRO_IDEA_AMOUNT_CENTS,
					micro.map((holding) => holding.weightBps),
				).every((amount) => amount >= 10),
			).toBe(true);
		}
	});

	it("allocates integer cents without losing the remainder", () => {
		const amounts = allocateWeightedCents(1001, [3333, 3333, 3334]);
		expect(amounts).toEqual([334, 333, 334]);
		expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBe(1001);
	});

	it("computes a total that keeps every holding above the minimum", () => {
		const total = minimumWeightedAmountCents([9000, 1000]);
		const amounts = allocateWeightedCents(total, [9000, 1000]);
		expect(amounts.every((amount) => amount >= 10)).toBe(true);
		expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBe(total);
	});

	it("converts cents to exact six-decimal USDC base units", () => {
		const legs = bundleExecutionLegs({
			id: "draft",
			bundleId: "draft",
			title: "Draft",
			amountCents: 100,
			holdings: [
				{
					candidate: candidate("SOL"),
					weightBps: 6000,
					sourceWeightBps: 6000,
				},
				{
					candidate: candidate("JUP"),
					weightBps: 4000,
					sourceWeightBps: 4000,
				},
			],
		});
		expect(legs.map((leg) => leg.amountInBaseUnits)).toEqual([
			"600000",
			"400000",
		]);
	});
});
