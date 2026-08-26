import { describe, expect, it } from "vitest";
import { sha256 } from "../src/domain/canonical.js";
import {
	eligibleCandidates,
	PolicyError,
	validateFeed,
	validateRanking,
} from "../src/domain/policy.js";
import {
	budgetForTicket,
	DEFAULT_BUDGET,
	feedInputSchema,
	rankingInputSchema,
} from "../src/domain/schemas.js";
import { DeterministicRanker } from "../src/server/adapters/deterministic-ranker.js";
import {
	SolanaDemoCandidateProvider,
	SolanaDemoExecutionProvider,
} from "../src/server/adapters/solana-demo.js";

const candidatesProvider = new SolanaDemoCandidateProvider();
const executionProvider = new SolanaDemoExecutionProvider("JUPITER");

async function quotedCandidates(now = new Date()) {
	const candidates = await candidatesProvider.getCandidates("demo-wallet", undefined, now);
	return Promise.all(
		candidates.map(async (candidate) => ({
			...candidate,
			quote: await executionProvider.price(
				"11111111111111111111111111111111",
				"11111111111111111111111111111111",
				candidate,
				"10000000",
				50,
			),
		})),
	);
}

async function feedFixture() {
	const candidates = (await quotedCandidates()).slice(0, 3);
	const unsigned = {
		schemaVersion: "investmade-feed-input/v1" as const,
		sessionId: "session-1",
		epochId: "2026-W30",
		policyVersion: "investmade-policy/v1" as const,
		budget: DEFAULT_BUDGET,
		preferences: {
			activeChain: "SOLANA" as const,
			executionProvider: "JUPITER" as const,
			cadence: "weekly" as const,
			ticketSizeUsd: 10,
			riskMode: "balanced" as const,
			assetClasses: ["CRYPTO", "STOCK_TOKEN"] as const,
		},
		candidates,
	};
	const input = feedInputSchema.parse({ ...unsigned, inputCommitment: sha256(unsigned) });
	const output = {
		schemaVersion: "investmade-feed-output/v1" as const,
		sessionId: input.sessionId,
		inputCommitment: input.inputCommitment,
		policyVersion: "investmade-policy/v1" as const,
		regime: "CRYPTO_NEUTRAL" as const,
		cards: candidates.map((candidate, index) => ({
			assetId: candidate.assetId,
			action: "BUY" as const,
			rank: index + 1,
			amountInBaseUnits: "10000000",
			scoreBps: 7000 - index,
			evidenceIds: candidate.evidenceIds,
			reason: candidate.reason,
		})),
		warnings: [],
	};
	return { candidates, input, output };
}

describe("Solana feed policy", () => {
	it("accepts fresh canonical Solana candidates and rejects expired quotes", async () => {
		const candidates = await quotedCandidates();
		const now = new Date();
		expect(eligibleCandidates(candidates, now)).toHaveLength(candidates.length);
		const first = candidates[0];
		if (!first?.quote) throw new Error("Expected a quoted Solana candidate");
		first.quote.expiresAt = new Date(now.getTime() - 1).toISOString();
		expect(eligibleCandidates(candidates, now)).toHaveLength(candidates.length - 1);
	});

	it("rejects an asset invented by the ranking model", async () => {
		const { candidates, input, output } = await feedFixture();
		const first = output.cards[0];
		if (!first) throw new Error("Expected a feed card");
		first.assetId = "sol:mainnet:INVENTED";
		expect(() => validateFeed(output, input, candidates)).toThrowError(
			new PolicyError(
				"ASSET_NOT_ELIGIBLE",
				"Asset sol:mainnet:INVENTED did not pass the candidate gate.",
			),
		);
	});

	it("rejects a feed commitment mismatch", async () => {
		const { candidates, input, output } = await feedFixture();
		output.inputCommitment = `sha256:${"0".repeat(64)}`;
		expect(() => validateFeed(output, input, candidates)).toThrowError(/commitment/);
	});

	it("derives basket capacity from the period budget", () => {
		expect(budgetForTicket(0.1).maxCards).toBe(1000);
		expect(budgetForTicket(25).maxCards).toBe(4);
	});

	it("completes a partial private-ranking shortlist from the supplied universe", async () => {
		const candidates = await candidatesProvider.getRankingCandidates(5);
		const unsigned = {
			schemaVersion: "investmade-ranking-input/v1" as const,
			sessionId: "session-ranking",
			epochId: "2026-W30",
			policyVersion: "investmade-policy/v1" as const,
			budget: DEFAULT_BUDGET,
			preferences: {
				activeChain: "SOLANA" as const,
				executionProvider: "JUPITER" as const,
				cadence: "weekly" as const,
				ticketSizeUsd: 10,
				riskMode: "balanced" as const,
				assetClasses: ["CRYPTO", "STOCK_TOKEN"] as const,
			},
			candidates,
		};
		const input = rankingInputSchema.parse({
			...unsigned,
			inputCommitment: sha256(unsigned),
		});
		const generated = await new DeterministicRanker().rank(input);
		const removed = generated.output.assets.pop();
		if (!removed) throw new Error("Expected a ranked asset");
		const ranking = validateRanking(generated.output, input, candidates);
		expect(ranking.assets).toHaveLength(candidates.length);
		expect(ranking.assets.at(-1)).toMatchObject({
			assetId: removed.assetId,
			rank: candidates.length,
			scoreBps: 0,
		});
	});
});
