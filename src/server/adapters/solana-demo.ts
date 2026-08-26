import { sha256 } from "../../domain/canonical.js";
import { SOLANA_ASSET_REGISTRY } from "../../domain/solana.js";
import type {
	Candidate,
	ExecutionProviderId,
	ExecutionRequest,
	Quote,
	RankingCandidate,
} from "../../domain/schemas.js";
import type {
	CandidateDiscoveryOptions,
	CandidateProvider,
	ExecutionProvider,
	SolanaPreparedTransaction,
} from "./types.js";

const DEMO_MARKET_PRICE_USD: Record<string, number> = {
	SOL: 175,
	JUP: 0.9,
	AAPLx: 230,
	NVDAx: 180,
	TSLAx: 340,
};

export class SolanaDemoCandidateProvider implements CandidateProvider {
	async getAsset(assetId: string) {
		return Object.values(SOLANA_ASSET_REGISTRY).find(
			(asset) => asset.assetId === assetId,
		);
	}

	async getRankingCandidates(
		limit: number,
		excludedAssetIds: string[] = [],
		_options: CandidateDiscoveryOptions = {},
	): Promise<RankingCandidate[]> {
		const excluded = new Set(excludedAssetIds);
		return Object.values(SOLANA_ASSET_REGISTRY)
			.filter((asset) => !excluded.has(asset.assetId))
			.slice(0, limit)
			.map((asset, index) => ({
				chain: "SOLANA",
				assetId: asset.assetId,
				symbol: asset.symbol,
				name: asset.name,
				kind: asset.kind,
				contract: asset.address,
				decimals: asset.decimals,
				discoveryRank: index + 1,
				priceUsd: DEMO_MARKET_PRICE_USD[asset.symbol],
				primaryClassification:
					asset.kind === "STOCK_TOKEN" ? "TOKENIZED_STOCK" : "CRYPTO",
				classificationConfidence: "HIGH",
				tags: [asset.kind === "STOCK_TOKEN" ? "tokenized-stock" : "crypto"],
				riskFlags: [],
				classificationEvidence: [`demo:solana:${asset.symbol}`],
				marketDataSource: "demo",
			}));
	}

	async getCandidatesForFeed(
		_wallet: string,
		rankedAssetIds: string[],
		_amountInBaseUnits: string,
		_now: Date,
		limit: number,
	): Promise<Candidate[]> {
		const ranked = new Map(
			(await this.getCandidates("demo-wallet")).map((candidate) => [
				candidate.assetId,
				candidate,
			]),
		);
		return rankedAssetIds
			.flatMap((assetId) => ranked.get(assetId) ?? [])
			.slice(0, limit);
	}

	async getCandidates(
		_wallet: string,
		_amountInBaseUnits?: string,
		_now?: Date,
		limit = Object.keys(SOLANA_ASSET_REGISTRY).length,
		excludedAssetIds: string[] = [],
	): Promise<Candidate[]> {
		const excluded = new Set(excludedAssetIds);
		return Object.values(SOLANA_ASSET_REGISTRY)
			.filter((asset) => !excluded.has(asset.assetId))
			.slice(0, limit)
			.map((asset) => ({
				chain: "SOLANA",
				assetId: asset.assetId,
				symbol: asset.symbol,
				name: asset.name,
				kind: asset.kind,
				contract: asset.address,
				decimals: asset.decimals,
				eligible: true,
				marketHealthy: true,
				permissionAllowed: true,
				marketPriceUsd: DEMO_MARKET_PRICE_USD[asset.symbol],
				marketDataSource: "demo",
				primaryClassification:
					asset.kind === "STOCK_TOKEN" ? "TOKENIZED_STOCK" : "CRYPTO",
				classificationConfidence: "HIGH",
				tags: [asset.kind === "STOCK_TOKEN" ? "tokenized-stock" : "crypto"],
				riskFlags: [],
				classificationEvidence: [`demo:solana:${asset.symbol}`],
				crowdScoreBps: 7_500,
				reason: `Deterministic Solana demo candidate for ${asset.symbol}.`,
				evidenceIds: [`demo:solana:${asset.symbol}`],
			}));
	}

	async getCandidatesForExecution(
		wallet: string,
		assetIds: string[],
		amountInBaseUnits?: string,
		now?: Date,
	): Promise<Candidate[]> {
		const selected = new Set(assetIds);
		return (await this.getCandidates(wallet, amountInBaseUnits, now)).filter(
			(candidate) => selected.has(candidate.assetId),
		);
	}
}

export class SolanaDemoExecutionProvider implements ExecutionProvider {
	readonly label: string;

	constructor(readonly id: Extract<ExecutionProviderId, "JUPITER">) {
		this.label = id === "JUPITER" ? "Jupiter Demo" : "0x Demo";
	}

	async health() {
		return { available: true, status: "CONFIGURED" as const };
	}

	async price(
		_wallet: string,
		_txOrigin: string,
		candidate: Candidate,
		amountInBaseUnits: string,
		slippageBps: number,
	): Promise<Quote> {
		return this.buyQuote(candidate, amountInBaseUnits, slippageBps, new Date());
	}

	async prepareBasket(
		wallet: string,
		request: ExecutionRequest,
		candidates: Candidate[],
	): Promise<{ quotes: Quote[]; solanaTransaction: SolanaPreparedTransaction }> {
		if (request.chain !== "SOLANA") throw new Error("UNSUPPORTED_CHAIN");
		const byId = new Map(candidates.map((candidate) => [candidate.assetId, candidate]));
		const now = new Date();
		const quotes = request.selections.map((selection) => {
			const candidate = byId.get(selection.assetId);
			if (!candidate) throw new Error(`DEMO_ASSET_UNAVAILABLE:${selection.assetId}`);
			return this.buyQuote(
				candidate,
				selection.amountInBaseUnits,
				request.slippageBps,
				now,
			);
		});
		return { quotes, solanaTransaction: this.transaction(wallet, quotes) };
	}

	private buyQuote(
		candidate: Candidate,
		amountInBaseUnits: string,
		slippageBps: number,
		now: Date,
	): Quote {
		const estimated =
			(BigInt(amountInBaseUnits) * 10n ** BigInt(candidate.decimals)) /
			this.priceMicros(candidate);
		return this.quote(
			candidate,
			candidate.contract,
			amountInBaseUnits,
			estimated,
			slippageBps,
			now,
		);
	}

	private quote(
		candidate: Candidate,
		tokenOut: string,
		amountInBaseUnits: string,
		estimated: bigint,
		slippageBps: number,
		now: Date,
	): Quote {
		const minimum = (estimated * BigInt(10_000 - slippageBps)) / 10_000n;
		return {
			requestId: `demo-solana-${this.id.toLowerCase()}-${candidate.symbol.toLowerCase()}-${now.getTime()}`,
			provider: this.id,
			chain: "SOLANA",
			assetId: candidate.assetId,
			tokenOut,
			amountInBaseUnits,
			estimatedAmountOut: estimated.toString(),
			minimumAmountOut: minimum.toString(),
			unitPriceUsd: String(DEMO_MARKET_PRICE_USD[candidate.symbol] ?? 1),
			priceImpactBps: 0,
			routing: this.id,
			providerEvidence: { source: "deterministic-solana-demo" },
			quotedAt: now.toISOString(),
			expiresAt: new Date(now.getTime() + 60_000).toISOString(),
		};
	}

	private transaction(
		wallet: string,
		quotes: Quote[],
	): SolanaPreparedTransaction {
		const payload = {
			kind: "SOLANA_DEMO_TRANSACTION",
			wallet,
			provider: this.id,
			quotes: quotes.map((quote) => ({
				assetId: quote.assetId,
				amountInBaseUnits: quote.amountInBaseUnits,
				minimumAmountOut: quote.minimumAmountOut,
			})),
		};
		return {
			kind: "SOLANA_TRANSACTION",
			unsignedTransactionBase64: Buffer.from(JSON.stringify(payload)).toString(
				"base64",
			),
			messageCommitment: sha256(payload),
			recentBlockhash: "11111111111111111111111111111111",
			lastValidBlockHeight: 1,
			expectedBalanceChanges: quotes.map((quote) => ({
				assetId: quote.assetId,
				mint: quote.tokenOut,
				minimumAmountOut: quote.minimumAmountOut,
			})),
		};
	}

	private priceMicros(candidate: Candidate): bigint {
		return BigInt(
			Math.round((DEMO_MARKET_PRICE_USD[candidate.symbol] ?? 1) * 1_000_000),
		);
	}
}
