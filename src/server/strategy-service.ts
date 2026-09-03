import { randomUUID } from "node:crypto";
import { solanaAssetIconUrl } from "../domain/solana.js";
import type { RankingCandidate } from "../domain/schemas.js";
import {
	allocateStrategyWeights,
	generateStrategyRequestSchema,
	normalizeWeights,
	type PortfolioDraft,
	type PortfolioGenerationModelInput,
	STRATEGY_MIN_WEIGHT_BPS,
	validateModelPortfolioSelection,
} from "../domain/strategies.js";
import type {
	CandidateProvider,
	PrivateInferenceProvider,
} from "./adapters/types.js";
import type { XStocksCatalogSource } from "./adapters/xstocks-catalog.js";

const STRATEGY_CANDIDATE_LIMIT = 120;

const XSTOCKS_THESIS_TAGS: Record<string, string[]> = {
	AMGNX: ["pharmaceuticals", "GLP-1", "obesity treatment"],
	LLYX: [
		"pharmaceuticals",
		"GLP-1",
		"tirzepatide",
		"Mounjaro",
		"Zepbound",
		"obesity treatment",
	],
	NVOX: [
		"pharmaceuticals",
		"GLP-1",
		"semaglutide",
		"Ozempic",
		"Wegovy",
		"obesity treatment",
	],
};

export class StrategyGenerationService {
	constructor(
		private readonly candidates: CandidateProvider,
		private readonly inference: PrivateInferenceProvider,
		private readonly xstocks?: XStocksCatalogSource,
	) {}

	async assets() {
		const discovered = await this.candidates.getRankingCandidates(
			STRATEGY_CANDIDATE_LIMIT,
			[],
			{
				includeCommunity: true,
			},
		);
		const catalog = this.xstocks
			? await this.xstocks.assets().catch(() => [])
			: [];
		const merged = new Map(
			discovered.map((candidate) => [
				candidate.contract ?? candidate.assetId,
				candidate,
			]),
		);
		for (const asset of catalog) {
			const tags = [
				...(asset.category ? [asset.category.toLowerCase()] : []),
				...(XSTOCKS_THESIS_TAGS[asset.symbol.toUpperCase()] ?? []),
			];
			const current = merged.get(asset.address);
			if (current) {
				merged.set(asset.address, {
					...current,
					name: asset.name,
					tags: [...new Set([...current.tags, ...tags])],
					iconUrl: solanaAssetIconUrl(asset.symbol, asset.iconUrl),
				});
				continue;
			}
			merged.set(asset.address, {
				chain: "SOLANA",
				assetId: asset.assetId,
				symbol: asset.symbol,
				name: asset.name,
				kind: "STOCK_TOKEN",
				contract: asset.address,
				decimals: asset.decimals,
				discoveryRank: merged.size + 1,
				verified: true,
				primaryClassification: "TOKENIZED_STOCK",
				classificationConfidence: "HIGH",
				tags,
				riskFlags: [],
				classificationEvidence: ["xstocks-official-catalog"],
				iconUrl: solanaAssetIconUrl(asset.symbol, asset.iconUrl),
			});
		}
		return [...merged.values()];
	}

	async generate(value: unknown): Promise<PortfolioDraft> {
		const input = generateStrategyRequestSchema.parse(value);
		const candidates = await this.assets();
		if (!candidates.length) throw new Error("STRATEGY_CANDIDATES_UNAVAILABLE");
		const keyed = candidates.map((candidate, index) => ({
			key: `a${String(index).padStart(3, "0")}`,
			candidate,
		}));
		const modelInput: PortfolioGenerationModelInput = {
			prompt: input.prompt,
			maxHoldings: Math.min(input.maxHoldings, keyed.length),
			candidates: keyed.map(({ key, candidate }) => ({
				key,
				symbol: candidate.symbol,
				name: candidate.name,
				kind: candidate.kind,
				classification: candidate.primaryClassification,
				tags: candidate.tags,
			})),
		};
		let raw: unknown;
		const warnings: string[] = [];
		if (this.inference.generatePortfolioDraft) {
			raw = await this.inference.generatePortfolioDraft(modelInput);
		} else {
			raw = deterministicPortfolio(modelInput, keyed);
			warnings.push(
				"Private AI generation is unavailable; a deterministic portfolio draft was used.",
			);
		}
		const valid = validateModelPortfolioSelection(
			raw,
			new Set(keyed.map(({ key }) => key)),
			modelInput.maxHoldings,
		);
		const weighted = allocateStrategyWeights(valid.holdings);
		const byKey = new Map(keyed.map((item) => [item.key, item.candidate]));
		return {
			id: randomUUID(),
			name: valid.name,
			description: valid.description,
			holdings: weighted.map((holding) => {
				const candidate = byKey.get(holding.key);
				if (!candidate) throw new Error("UNKNOWN_GENERATED_ASSET");
				return {
					assetId: candidate.assetId,
					symbol: candidate.symbol,
					name: candidate.name,
					kind: candidate.kind,
					weightBps: holding.weightBps,
					scoreBps: holding.scoreBps,
					reason: holding.reason,
					exposureType: holding.exposureType,
					...(holding.proxyFor ? { proxyFor: holding.proxyFor } : {}),
					...(candidate.iconUrl ? { iconUrl: candidate.iconUrl } : {}),
				};
			}),
			warnings,
			generatedAt: new Date().toISOString(),
		};
	}
}

function deterministicPortfolio(
	input: PortfolioGenerationModelInput,
	keyed: Array<{ key: string; candidate: RankingCandidate }>,
) {
	const words = input.prompt
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word.length > 2);
	const scored = keyed
		.map((item) => {
			const haystack = [
				item.candidate.symbol,
				item.candidate.name,
				item.candidate.kind,
				item.candidate.primaryClassification,
				...item.candidate.tags,
			]
				.join(" ")
				.toLowerCase();
			const matches = words.filter((word) => haystack.includes(word)).length;
			return {
				...item,
				score: Math.max(
					1,
					matches * 2_000 +
						(STRATEGY_CANDIDATE_LIMIT - item.candidate.discoveryRank),
				),
			};
		})
		.sort(
			(left, right) =>
				right.score - left.score ||
				left.candidate.assetId.localeCompare(right.candidate.assetId),
		)
		.slice(0, Math.min(input.maxHoldings, keyed.length, 5));
	const weights = normalizeWeights(scored.map((item) => item.score));
	return {
		name:
			input.prompt.length > 64 ? `${input.prompt.slice(0, 61)}…` : input.prompt,
		description: `An editable portfolio draft based on “${input.prompt}”.`,
		holdings: scored.map((item, index) => ({
			key: item.key,
			weightBps: weights[index] ?? STRATEGY_MIN_WEIGHT_BPS,
			scoreBps: Math.min(10_000, 6_000 + item.score),
			reason: `${item.candidate.symbol} is an executable server candidate related to this thesis.`,
			exposureType: "DIRECT" as const,
		})),
	};
}
