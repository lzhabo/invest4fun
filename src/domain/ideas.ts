import type { Candidate } from "./schemas.js";
import { normalizeWeights } from "./strategies.js";

export const MINIMUM_POSITION_AMOUNT_CENTS = 10;

export type BundleRisk = "Medium risk" | "High risk";

export interface BundleHoldingDefinition {
	assetId: string;
	symbol: string;
	name: string;
	iconUrl?: string;
	weightBps: number;
}

export interface BundleDefinition {
	id: string;
	title: string;
	subtitle: string;
	description: string;
	details: string;
	risk: BundleRisk;
	sourceUrl: string;
	minimumInvestmentCents: number;
	holdings: BundleHoldingDefinition[];
}

const token = (
	mint: string,
	symbol: string,
	name: string,
	weightBps: number,
	iconUrl?: string,
): BundleHoldingDefinition => ({
	assetId: `sol:mainnet:${mint}`,
	symbol,
	name,
	weightBps,
	iconUrl,
});

const xstock = (
	mint: string,
	symbol: string,
	name: string,
	weightBps: number,
): BundleHoldingDefinition =>
	token(
		mint,
		symbol,
		name,
		weightBps,
		`https://xstocks-metadata.backed.fi/logos/tokens/${symbol}.png`,
	);

// The original reference Ideas cards, kept in their established order.
export const IDEA_BUNDLES: BundleDefinition[] = [
	{
		id: "war-mode",
		title: "Modern Warfare",
		subtitle: "Defense and security",
		description:
			"Owns aerospace, defense, and industrial names tied to security spending.",
		details:
			"A geopolitical-risk basket focused on defense primes and strategic manufacturers.",
		risk: "High risk",
		sourceUrl: "https://app.cesto.co/product/war-mode",
		minimumInvestmentCents: 2500,
		holdings: [
			token(
				"12BvLZtzjdssAycxPeBQUjukhmgQpULAvy6SroYdondo",
				"RTXon",
				"RTX",
				1800,
				"https://cdn.ondo.finance/tokens/logos/rtxon_160x160.png",
			),
			token(
				"EoReHwUnGGekbXFHLj5rbCVKiwWqu32GrETMfw4ondo",
				"LMTon",
				"Lockheed Martin",
				1700,
				"https://cdn.ondo.finance/tokens/logos/lmton_160x160.png",
			),
			token(
				"Dm6FpQ76SsbVmAZ4NvD2mjZP7cxbw1CASr4WwCiondo",
				"NOCon",
				"Northrop Grumman",
				1600,
				"https://cdn.ondo.finance/tokens/logos/nocon_160x160.png",
			),
			token(
				"HfsnTS5qtdStwec9DfBrunRqnAMYMMz1kjv9Hu9ondo",
				"PLTRon",
				"Palantir",
				1300,
				"https://cdn.ondo.finance/tokens/logos/pltron_160x160.png",
			),
			token(
				"aTBfDuLRqYHBiG82bHA7DzwjSDTFre2dRtGH3S5ondo",
				"GEon",
				"General Electric",
				1200,
				"https://cdn.ondo.finance/tokens/logos/geon_160x160.png",
			),
			token(
				"DDcAL93Urf7KrPntvKULnZoFs4Wdee1LkkJqLpjondo",
				"ITAon",
				"US Aerospace and Defense ETF",
				1000,
				"https://cdn.ondo.finance/tokens/logos/itaon_160x160.png",
			),
			token(
				"cdKfoNjbXgnSuxvoajhtH3uixfZhq1YXhQsS1Rwondo",
				"CRWDon",
				"CrowdStrike",
				700,
				"https://cdn.ondo.finance/tokens/logos/crwdon_160x160.png",
			),
			token(
				"1YVZ4LGpq8CAhpdpm3mgy7GgPb83gJczCpxLUQ3ondo",
				"BAon",
				"Boeing",
				700,
				"https://cdn.ondo.finance/tokens/logos/baon_160x160.png",
			),
		],
	},
	{
		id: "ai-leaders-portfolio",
		title: "AI Leaders Portfolio",
		subtitle: "AI market leaders",
		description:
			"Owns leading chip, cloud, and application companies in one basket.",
		details:
			"A concentrated tokenized-equity basket across the companies building and distributing AI.",
		risk: "High risk",
		sourceUrl: "https://app.cesto.co/product/ai-leaders-portfolio",
		minimumInvestmentCents: 1500,
		holdings: [
			xstock(
				"Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
				"NVDAx",
				"NVIDIA",
				2500,
			),
			xstock(
				"XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX",
				"MSFTx",
				"Microsoft",
				1700,
			),
			xstock(
				"XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN",
				"GOOGLx",
				"Alphabet",
				1600,
			),
			xstock(
				"Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu",
				"METAx",
				"Meta",
				1500,
			),
			xstock(
				"Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg",
				"AMZNx",
				"Amazon",
				1500,
			),
			xstock(
				"XsgSaSvNSqLTtFuyWPBhK9196Xb9Bbdyjj4fH3cPJGo",
				"AVGOx",
				"Broadcom",
				800,
			),
			xstock(
				"XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4",
				"PLTRx",
				"Palantir",
				400,
			),
		],
	},
	{
		id: "capitol-gains",
		title: "Capitol Gains",
		subtitle: "Congressional trade themes",
		description:
			"Tracks the tokenized equities most prominent in disclosed congressional trades.",
		details:
			"A conviction-weighted equity basket shaped by trade size and cross-politician popularity.",
		risk: "High risk",
		sourceUrl: "https://app.cesto.co/product/capitol-gains",
		minimumInvestmentCents: 3000,
		holdings: [
			xstock(
				"Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
				"NVDAx",
				"NVIDIA",
				2000,
			),
			xstock(
				"XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN",
				"GOOGLx",
				"Alphabet",
				1500,
			),
			xstock(
				"Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg",
				"AMZNx",
				"Amazon",
				1500,
			),
			xstock(
				"XsgSaSvNSqLTtFuyWPBhK9196Xb9Bbdyjj4fH3cPJGo",
				"AVGOx",
				"Broadcom",
				1200,
			),
			xstock(
				"XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
				"AAPLx",
				"Apple",
				1000,
			),
			xstock(
				"XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX",
				"MSFTx",
				"Microsoft",
				1000,
			),
			xstock(
				"XshPgPdXFRWB8tP1j82rebb2Q9rPgGX37RuqzohmArM",
				"INTCx",
				"Intel",
				800,
			),
			xstock(
				"Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu",
				"METAx",
				"Meta",
				1000,
			),
		],
	},
	{
		id: "solana-infrastructure",
		title: "Solana Infrastructure",
		subtitle: "Core Solana protocols",
		description: "Backs the protocols and assets that keep Solana moving.",
		details:
			"Liquid staking, trading infrastructure, and core Solana exposure.",
		risk: "Medium risk",
		sourceUrl: "https://app.cesto.co/product/solana-infrastructure",
		minimumInvestmentCents: 2500,
		holdings: [
			token(
				"So11111111111111111111111111111111111111112",
				"SOL",
				"Wrapped SOL",
				1800,
				"/assets/solana.jpg",
			),
			token(
				"J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
				"JitoSOL",
				"Jito Staked SOL",
				1400,
				"https://storage.googleapis.com/token-metadata/JitoSOL-256.png",
			),
			token(
				"jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",
				"JTO",
				"Jito",
				1200,
				"https://metadata.jito.network/token/jto/image",
			),
			token(
				"JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
				"JUP",
				"Jupiter",
				1200,
				"https://static.jup.ag/jup/icon.png",
			),
			token(
				"mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
				"mSOL",
				"Marinade staked SOL",
				1200,
			),
			token(
				"KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS",
				"KMNO",
				"Kamino",
				1100,
				"https://cdn.kamino.finance/kamino.svg",
			),
			token(
				"4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
				"RAY",
				"Raydium",
				1100,
			),
			token(
				"orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
				"ORCA",
				"Orca",
				1000,
			),
		],
	},
];

export function highestWeightBundleHolding(bundle: BundleDefinition) {
	return bundle.holdings.reduce<BundleHoldingDefinition | undefined>(
		(highest, holding) =>
			!highest || holding.weightBps > highest.weightBps ? holding : highest,
		undefined,
	);
}

export function resolveBundleHoldings(
	bundle: BundleDefinition,
	candidates: Candidate[],
): ResolvedBundleHolding[] {
	const byId = new Map(
		candidates.map((candidate) => [candidate.assetId, candidate]),
	);
	const available = bundle.holdings.flatMap((holding) => {
		const candidate = byId.get(holding.assetId);
		return candidate
			? [
					{
						candidate: holding.iconUrl
							? { ...candidate, iconUrl: holding.iconUrl }
							: candidate,
						sourceWeightBps: holding.weightBps,
					},
				]
			: [];
	});
	const weights = normalizeWeights(
		available.map((holding) => holding.sourceWeightBps),
	);
	return available.map((holding, index) => ({
		...holding,
		weightBps: weights[index] ?? 0,
	}));
}

export function minimumBundleAmountCents(holdings: ResolvedBundleHolding[]) {
	return minimumWeightedAmountCents(
		holdings.map((holding) => holding.weightBps),
	);
}

export interface ResolvedBundleHolding {
	candidate: Candidate;
	weightBps: number;
	sourceWeightBps: number;
}

export interface BundleBasketItem {
	id: string;
	bundleId: string;
	title: string;
	amountCents: number;
	holdings: ResolvedBundleHolding[];
}

export interface ExecutionLeg {
	candidate: Candidate;
	amountInBaseUnits: string;
	bundleIds: string[];
}

export function allocateWeightedCents(
	totalCents: number,
	weights: readonly number[],
) {
	if (!Number.isInteger(totalCents) || totalCents <= 0 || !weights.length) {
		return [];
	}
	const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
	if (weightTotal <= 0) return [];
	const exact = weights.map((weight) => (totalCents * weight) / weightTotal);
	const amounts = exact.map(Math.floor);
	let remainder = totalCents - amounts.reduce((sum, amount) => sum + amount, 0);
	const order = exact
		.map((amount, index) => ({
			index,
			fraction: amount - (amounts[index] ?? 0),
		}))
		.sort(
			(left, right) =>
				right.fraction - left.fraction || left.index - right.index,
		);
	for (let index = 0; remainder > 0; index += 1, remainder -= 1) {
		const target = order[index % order.length]?.index;
		if (target === undefined) break;
		amounts[target] = (amounts[target] ?? 0) + 1;
	}
	return amounts;
}

export function minimumWeightedAmountCents(weights: readonly number[]) {
	if (!weights.length || weights.some((weight) => weight <= 0)) {
		return Number.POSITIVE_INFINITY;
	}
	const smallest = Math.min(...weights);
	const upperBound = Math.ceil(
		(MINIMUM_POSITION_AMOUNT_CENTS * 10_000) / smallest,
	);
	for (
		let totalCents = weights.length * MINIMUM_POSITION_AMOUNT_CENTS;
		totalCents <= upperBound;
		totalCents += 1
	) {
		if (
			allocateWeightedCents(totalCents, weights).every(
				(amount) => amount >= MINIMUM_POSITION_AMOUNT_CENTS,
			)
		) {
			return totalCents;
		}
	}
	return Number.POSITIVE_INFINITY;
}

export function bundleExecutionLegs(item: BundleBasketItem): ExecutionLeg[] {
	const amounts = allocateWeightedCents(
		item.amountCents,
		item.holdings.map((holding) => holding.weightBps),
	);
	return item.holdings.map((holding, index) => ({
		candidate: holding.candidate,
		amountInBaseUnits: (BigInt(amounts[index] ?? 0) * 10_000n).toString(),
		bundleIds: [item.bundleId],
	}));
}
