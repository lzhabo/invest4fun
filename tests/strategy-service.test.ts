import { describe, expect, it } from "vitest";
import type { RankingCandidate } from "../src/domain/schemas.js";
import type {
	CandidateProvider,
	PrivateInferenceProvider,
} from "../src/server/adapters/types.js";
import { StrategyGenerationService } from "../src/server/strategy-service.js";

const assets: RankingCandidate[] = [
	{
		chain: "SOLANA",
		assetId: "sol:mainnet:SOL",
		symbol: "SOL",
		name: "Solana",
		kind: "CRYPTO",
		discoveryRank: 1,
		primaryClassification: "CRYPTO",
		classificationConfidence: "HIGH",
		tags: ["infrastructure"],
		riskFlags: [],
		classificationEvidence: ["registry"],
	},
	{
		chain: "SOLANA",
		assetId: "sol:mainnet:JUP",
		symbol: "JUP",
		name: "Jupiter",
		kind: "CRYPTO",
		discoveryRank: 2,
		primaryClassification: "CRYPTO",
		classificationConfidence: "HIGH",
		tags: ["liquidity"],
		riskFlags: [],
		classificationEvidence: ["registry"],
	},
];

const candidates = {
	getRankingCandidates: async () => assets,
} as unknown as CandidateProvider;

const validModelOutput = {
	name: "Solana infrastructure",
	description: "An editable draft focused on Solana infrastructure.",
	holdings: [
		{
			key: "a000",
			weightBps: 6000,
			scoreBps: 9000,
			reason: "Core infrastructure",
			exposureType: "DIRECT",
		},
		{
			key: "a001",
			weightBps: 4000,
			scoreBps: 8000,
			reason: "Liquidity infrastructure",
			exposureType: "DIRECT",
		},
	],
};

describe("StrategyGenerationService", () => {
	it("adds official xStocks candidates and thesis tags to the model catalog", async () => {
		let received: unknown;
		const inference = {
			rank: async () => {
				throw new Error("not used");
			},
			generatePortfolioDraft: async (input: unknown) => {
				received = input;
				return {
					name: "Ozempic companies",
					description:
						"An editable draft focused on supplied Ozempic companies.",
					holdings: [
						{
							key: "a002",
							scoreBps: 9_500,
							reason: "The supplied tags include Ozempic and GLP-1.",
							exposureType: "DIRECT",
						},
					],
				};
			},
		} as unknown as PrivateInferenceProvider;
		const xstocks = {
			assets: async () => [
				{
					assetId: "sol:mainnet:NVO_MINT",
					symbol: "NVOx",
					name: "Novo Nordisk xStock",
					kind: "STOCK_TOKEN" as const,
					category: "STOCK" as const,
					address: "NVO_MINT",
					decimals: 8,
				},
			],
		};

		const draft = await new StrategyGenerationService(
			candidates,
			inference,
			xstocks,
		).generate({ prompt: "ozempic companies", maxHoldings: 6 });
		const serialized = JSON.stringify(received);

		expect(serialized).toContain("NVOx");
		expect(serialized).toContain("Ozempic");
		expect(serialized).toContain("GLP-1");
		expect(serialized).not.toContain("NVO_MINT");
		expect(draft.holdings[0]?.assetId).toBe("sol:mainnet:NVO_MINT");
	});

	it("gives the model opaque keys and resolves them to server assets", async () => {
		let received: unknown;
		const inference = {
			rank: async () => {
				throw new Error("not used");
			},
			generatePortfolioDraft: async (input: unknown) => {
				received = input;
				return validModelOutput;
			},
		} as unknown as PrivateInferenceProvider;
		const draft = await new StrategyGenerationService(
			candidates,
			inference,
		).generate({ prompt: "Solana infrastructure", maxHoldings: 8 });

		expect(JSON.stringify(received)).not.toContain("sol:mainnet:");
		expect(draft.holdings.map((holding) => holding.assetId)).toEqual([
			"sol:mainnet:SOL",
			"sol:mainnet:JUP",
		]);
	});

	it("sends the complete merged catalog to the model shortlist", async () => {
		let received: unknown;
		const inference = {
			rank: async () => {
				throw new Error("not used");
			},
			generatePortfolioDraft: async (input: unknown) => {
				received = input;
				return {
					name: "Complete catalog draft",
					description: "A draft selected from the complete server catalog.",
					holdings: [
						{
							key: "a171",
							scoreBps: 9_000,
							reason: "The final catalog asset matches the thesis.",
							exposureType: "DIRECT",
						},
					],
				};
			},
		} as unknown as PrivateInferenceProvider;
		const fullXstocksCatalog = {
			assets: async () =>
				Array.from({ length: 170 }, (_, index) => ({
					assetId: `sol:mainnet:STOCK_MINT_${index}`,
					symbol: `S${index}x`,
					name: `Stock ${index} xStock`,
					kind: "STOCK_TOKEN" as const,
					category: "STOCK" as const,
					address: `STOCK_MINT_${index}`,
					decimals: 8,
				})),
		};

		const draft = await new StrategyGenerationService(
			candidates,
			inference,
			fullXstocksCatalog,
		).generate({ prompt: "the final catalog company", maxHoldings: 6 });
		const modelInput = received as {
			candidates: Array<{ key: string; symbol: string }>;
		};

		expect(modelInput.candidates).toHaveLength(172);
		expect(modelInput.candidates.at(-1)).toEqual({
			key: "a171",
			symbol: "S169x",
			name: "Stock 169 xStock",
			kind: "STOCK_TOKEN",
			classification: "TOKENIZED_STOCK",
			tags: ["stock"],
		});
		expect(draft.holdings[0]?.assetId).toBe(
			"sol:mainnet:STOCK_MINT_169",
		);
	});

	it("rejects a model-generated key that the server did not supply", async () => {
		const inference = {
			rank: async () => {
				throw new Error("not used");
			},
			generatePortfolioDraft: async () => ({
				...validModelOutput,
				holdings: [
					{ ...validModelOutput.holdings[0], key: "a999", weightBps: 10_000 },
				],
			}),
		} as unknown as PrivateInferenceProvider;
		await expect(
			new StrategyGenerationService(candidates, inference).generate({
				prompt: "Solana infrastructure",
				maxHoldings: 8,
			}),
		).rejects.toThrow("MODEL_UNKNOWN_CANDIDATE_KEY:a999");
	});

	it("ignores model allocation totals and allocates validated selections", async () => {
		const inference = {
			rank: async () => {
				throw new Error("not used");
			},
			generatePortfolioDraft: async () => ({
				...validModelOutput,
				holdings: validModelOutput.holdings.map(
					({ weightBps: _weightBps, ...holding }) => holding,
				),
			}),
		} as unknown as PrivateInferenceProvider;
		const draft = await new StrategyGenerationService(
			candidates,
			inference,
		).generate({
			prompt: "Solana infrastructure",
			maxHoldings: 8,
		});
		expect(
			draft.holdings.reduce((sum, holding) => sum + holding.weightBps, 0),
		).toBe(10_000);
	});
});
