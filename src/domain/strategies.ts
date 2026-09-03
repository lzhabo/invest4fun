import { z } from "zod";

export const STRATEGY_TOTAL_WEIGHT_BPS = 10_000;
export const STRATEGY_MIN_WEIGHT_BPS = 100;
export const STRATEGY_MAX_HOLDINGS = 8;

export const generateStrategyRequestSchema = z
	.object({
		prompt: z.string().trim().min(1).max(1_000),
		maxHoldings: z.number().int().min(1).max(STRATEGY_MAX_HOLDINGS).default(6),
	})
	.strict();

export const modelPortfolioOutputSchema = z
	.object({
		name: z.string().trim().min(3).max(80),
		description: z.string().trim().min(8).max(500),
		holdings: z
			.array(
				z
					.object({
						key: z.string().regex(/^a\d{3}$/),
						weightBps: z
							.number()
							.int()
							.min(STRATEGY_MIN_WEIGHT_BPS)
							.max(STRATEGY_TOTAL_WEIGHT_BPS)
							.optional(),
						scoreBps: z.number().int().min(0).max(10_000),
						reason: z.string().trim().min(1).max(280),
						exposureType: z.enum(["DIRECT", "PROXY"]),
						proxyFor: z.string().trim().min(1).max(120).optional(),
					})
					.strict(),
			)
			.min(1)
			.max(STRATEGY_MAX_HOLDINGS),
	})
	.strict();

export interface PortfolioGenerationModelInput {
	prompt: string;
	maxHoldings: number;
	candidates: Array<{
		key: string;
		symbol: string;
		name: string;
		kind: "CRYPTO" | "STOCK_TOKEN";
		classification: string;
		tags: string[];
	}>;
}

export interface PortfolioDraftHolding {
	assetId: string;
	symbol: string;
	name: string;
	kind: "CRYPTO" | "STOCK_TOKEN";
	weightBps: number;
	scoreBps: number;
	reason: string;
	exposureType: "DIRECT" | "PROXY";
	proxyFor?: string;
	iconUrl?: string;
}

export interface PortfolioDraft {
	id: string;
	name: string;
	description: string;
	holdings: PortfolioDraftHolding[];
	warnings: string[];
	generatedAt: string;
}

export type GenerateStrategyRequest = z.output<
	typeof generateStrategyRequestSchema
>;
export type GenerateStrategyRequestInput = z.input<
	typeof generateStrategyRequestSchema
>;

export function validateModelPortfolioOutput(
	value: unknown,
	candidateKeys: ReadonlySet<string>,
	maxHoldings: number,
) {
	const parsed = validateModelPortfolioSelection(
		value,
		candidateKeys,
		maxHoldings,
	);
	if (parsed.holdings.some((holding) => holding.weightBps === undefined)) {
		throw new Error("STRATEGY_WEIGHTS_INVALID");
	}
	const totalWeightBps = parsed.holdings.reduce(
		(sum, holding) => sum + (holding.weightBps ?? 0),
		0,
	);
	if (totalWeightBps !== STRATEGY_TOTAL_WEIGHT_BPS) {
		throw new Error("STRATEGY_WEIGHTS_INVALID");
	}
	return parsed;
}

export function validateModelPortfolioSelection(
	value: unknown,
	candidateKeys: ReadonlySet<string>,
	maxHoldings: number,
) {
	const parsed = modelPortfolioOutputSchema.parse(value);
	if (parsed.holdings.length > maxHoldings) {
		throw new Error("STRATEGY_HOLDING_COUNT_INVALID");
	}
	const seen = new Set<string>();
	for (const holding of parsed.holdings) {
		if (!candidateKeys.has(holding.key)) {
			throw new Error(`MODEL_UNKNOWN_CANDIDATE_KEY:${holding.key}`);
		}
		if (seen.has(holding.key)) {
			throw new Error(`MODEL_DUPLICATE_CANDIDATE_KEY:${holding.key}`);
		}
		seen.add(holding.key);
	}
	return parsed;
}

export function allocateStrategyWeights<T extends { scoreBps: number }>(
	suggestions: readonly T[],
): Array<T & { weightBps: number }> {
	if (suggestions.length < 1 || suggestions.length > STRATEGY_MAX_HOLDINGS) {
		throw new Error("STRATEGY_HOLDING_COUNT_INVALID");
	}
	const weights = suggestions.map(() => STRATEGY_MIN_WEIGHT_BPS);
	const remaining =
		STRATEGY_TOTAL_WEIGHT_BPS -
		weights.reduce((sum, weight) => sum + weight, 0);
	const scores = suggestions.map((item) => Math.max(1, item.scoreBps));
	const scoreTotal = scores.reduce((sum, score) => sum + score, 0);
	const exact = scores.map((score) => (remaining * score) / scoreTotal);
	const floors = exact.map(Math.floor);
	let remainder = remaining - floors.reduce((sum, weight) => sum + weight, 0);
	const order = exact
		.map((weight, index) => ({
			index,
			fraction: weight - (floors[index] ?? 0),
		}))
		.sort(
			(left, right) =>
				right.fraction - left.fraction || left.index - right.index,
		);
	for (let index = 0; index < weights.length; index += 1) {
		weights[index] = (weights[index] ?? 0) + (floors[index] ?? 0);
	}
	for (let index = 0; remainder > 0; index += 1, remainder -= 1) {
		const target = order[index % order.length]?.index;
		if (target === undefined) break;
		weights[target] = (weights[target] ?? 0) + 1;
	}
	return suggestions.map((item, index) => ({
		...item,
		weightBps: weights[index] ?? STRATEGY_MIN_WEIGHT_BPS,
	}));
}

export function normalizeWeights(weights: readonly number[]): number[] {
	if (!weights.length || weights.some((weight) => weight < 0)) return [];
	const total = weights.reduce((sum, weight) => sum + weight, 0);
	if (total <= 0) return [];
	const exact = weights.map(
		(weight) => (weight * STRATEGY_TOTAL_WEIGHT_BPS) / total,
	);
	const normalized = exact.map(Math.floor);
	let remainder =
		STRATEGY_TOTAL_WEIGHT_BPS -
		normalized.reduce((sum, weight) => sum + weight, 0);
	const order = exact
		.map((weight, index) => ({
			index,
			fraction: weight - (normalized[index] ?? 0),
		}))
		.sort(
			(left, right) =>
				right.fraction - left.fraction || left.index - right.index,
		);
	for (let index = 0; remainder > 0; index += 1, remainder -= 1) {
		const target = order[index % order.length]?.index;
		if (target === undefined) break;
		normalized[target] = (normalized[target] ?? 0) + 1;
	}
	return normalized;
}

export function strategyWeightsAreValid(
	holdings: ReadonlyArray<{ weightBps: number }>,
) {
	return (
		holdings.length >= 1 &&
		holdings.length <= STRATEGY_MAX_HOLDINGS &&
		holdings.every(
			(holding) =>
				Number.isInteger(holding.weightBps) &&
				holding.weightBps >= STRATEGY_MIN_WEIGHT_BPS,
		) &&
		holdings.reduce((sum, holding) => sum + holding.weightBps, 0) ===
			STRATEGY_TOTAL_WEIGHT_BPS
	);
}

export function weightsWithNewHolding(current: readonly number[]) {
	if (!current.length) return [STRATEGY_TOTAL_WEIGHT_BPS];
	if (current.length >= STRATEGY_MAX_HOLDINGS) return [...current];
	return normalizeWeights([...current, STRATEGY_MIN_WEIGHT_BPS]);
}

export function rebalanceStrategyWeights(
	holdings: ReadonlyArray<{ weightBps: number }>,
	targetIndex: number,
	requestedWeightBps: number,
) {
	if (!holdings.length || targetIndex < 0 || targetIndex >= holdings.length) {
		return [];
	}
	if (holdings.length === 1) return [STRATEGY_TOTAL_WEIGHT_BPS];
	const maximum =
		STRATEGY_TOTAL_WEIGHT_BPS - (holdings.length - 1) * STRATEGY_MIN_WEIGHT_BPS;
	const targetWeight = Math.min(
		maximum,
		Math.max(STRATEGY_MIN_WEIGHT_BPS, Math.round(requestedWeightBps)),
	);
	const remainingIndexes = holdings
		.map((_, index) => index)
		.filter((index) => index !== targetIndex);
	const remainingWeights = normalizeWeights(
		remainingIndexes.map(
			(index) => holdings[index]?.weightBps ?? STRATEGY_MIN_WEIGHT_BPS,
		),
	).map((weight) =>
		Math.max(
			STRATEGY_MIN_WEIGHT_BPS,
			Math.floor(
				(weight * (STRATEGY_TOTAL_WEIGHT_BPS - targetWeight)) /
					STRATEGY_TOTAL_WEIGHT_BPS,
			),
		),
	);
	const result = holdings.map((_, index) =>
		index === targetIndex
			? targetWeight
			: (remainingWeights[remainingIndexes.indexOf(index)] ??
				STRATEGY_MIN_WEIGHT_BPS),
	);
	let difference =
		STRATEGY_TOTAL_WEIGHT_BPS - result.reduce((sum, weight) => sum + weight, 0);
	for (const index of remainingIndexes) {
		if (difference === 0) break;
		const next = (result[index] ?? STRATEGY_MIN_WEIGHT_BPS) + difference;
		if (next >= STRATEGY_MIN_WEIGHT_BPS) {
			result[index] = next;
			difference = 0;
		}
	}
	return difference === 0
		? result
		: holdings.map((holding) => holding.weightBps);
}
