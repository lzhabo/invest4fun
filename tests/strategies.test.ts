import { describe, expect, it } from "vitest";
import {
	allocateStrategyWeights,
	rebalanceStrategyWeights,
	strategyWeightsAreValid,
	validateModelPortfolioOutput,
	weightsWithNewHolding,
} from "../src/domain/strategies.js";

const validOutput = {
	name: "AI infrastructure",
	description: "A diversified portfolio draft for AI infrastructure.",
	holdings: [
		{
			key: "a000",
			weightBps: 6000,
			scoreBps: 9000,
			reason: "Direct compute exposure",
			exposureType: "DIRECT" as const,
		},
		{
			key: "a001",
			weightBps: 4000,
			scoreBps: 8000,
			reason: "Platform exposure",
			exposureType: "DIRECT" as const,
		},
	],
};

describe("portfolio draft validation", () => {
	it("accepts known unique keys totaling exactly 100%", () => {
		expect(
			validateModelPortfolioOutput(validOutput, new Set(["a000", "a001"]), 8)
				.holdings,
		).toHaveLength(2);
	});

	it("fails closed for unknown and duplicate candidate keys", () => {
		expect(() =>
			validateModelPortfolioOutput(validOutput, new Set(["a000"]), 8),
		).toThrow("MODEL_UNKNOWN_CANDIDATE_KEY:a001");
		expect(() =>
			validateModelPortfolioOutput(
				{
					...validOutput,
					holdings: [
						validOutput.holdings[0],
						{ ...validOutput.holdings[1], key: "a000" },
					],
				},
				new Set(["a000"]),
				8,
			),
		).toThrow("MODEL_DUPLICATE_CANDIDATE_KEY:a000");
	});

	it("rejects weights that do not total exactly 100%", () => {
		expect(() =>
			validateModelPortfolioOutput(
				{
					...validOutput,
					holdings: [
						{ ...validOutput.holdings[0], weightBps: 5900 },
						validOutput.holdings[1],
					],
				},
				new Set(["a000", "a001"]),
				8,
			),
		).toThrow("STRATEGY_WEIGHTS_INVALID");
	});
});

describe("portfolio draft editing", () => {
	it("allocates model scores to an exact 100% with minimum positions", () => {
		const weighted = allocateStrategyWeights([
			{ scoreBps: 9100 },
			{ scoreBps: 7300 },
			{ scoreBps: 0 },
		]);
		expect(weighted.reduce((sum, item) => sum + item.weightBps, 0)).toBe(
			10_000,
		);
		expect(weighted.every((item) => item.weightBps >= 100)).toBe(true);
	});

	it("assigns 100% to the first holding after an empty state", () => {
		expect(weightsWithNewHolding([])).toEqual([10_000]);
	});

	it("rebalances an edited position and preserves an exact 100% total", () => {
		const weights = rebalanceStrategyWeights(
			[{ weightBps: 5000 }, { weightBps: 3000 }, { weightBps: 2000 }],
			0,
			7000,
		);
		expect(weights.reduce((sum, weight) => sum + weight, 0)).toBe(10_000);
		expect(weights[0]).toBe(7000);
		expect(
			strategyWeightsAreValid(weights.map((weightBps) => ({ weightBps }))),
		).toBe(true);
	});
});
