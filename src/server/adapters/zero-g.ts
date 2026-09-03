import { z } from "zod";
import { sha256 } from "../../domain/canonical.js";
import type {
	RankingCandidate,
	RankingInput,
	RankingOutput,
} from "../../domain/schemas.js";
import type { PortfolioGenerationModelInput } from "../../domain/strategies.js";
import type { PrivateInferenceProvider } from "./types.js";

// Keep the private model's view aligned with the server discovery pool. Exact
// execution checks still happen only after the personalized ordering is known.
const MODEL_CANDIDATE_LIMIT = 60;
const MODEL_RESULT_LIMIT = 15;
const PORTFOLIO_SHORTLIST_LIMIT = 24;

export const DEFAULT_ZG_MODEL = "qwen3.8-flash";

export type ZeroGTrustMode = "private" | "verified" | "standard" | "any";
export type ZeroGJsonMode = "native" | "text" | "auto";

const modelRankingSchema = z
	.object({
		regime: z.enum([
			"CRYPTO_BULLISH",
			"CRYPTO_NEUTRAL",
			"CRYPTO_BEARISH",
			"RISK_OFF",
		]),
		top: z
			.array(
				z
					.object({
						key: z.string().regex(/^c\d{2}$/),
						score: z.number().int().min(0).max(100),
					})
					.strict(),
			)
			.min(1)
			.max(MODEL_RESULT_LIMIT),
	})
	.strict();

export const RANKING_SYSTEM_PROMPT = `Rank investment candidates for the supplied user preferences.
Return one JSON object only:
{"regime":"CRYPTO_BULLISH|CRYPTO_NEUTRAL|CRYPTO_BEARISH|RISK_OFF","top":[{"key":"c01","score":82}]}
Use only candidate keys from the input. Never copy or invent asset IDs.
Return exactly 15 unique keys when at least 15 candidates are supplied, otherwise return every key.
Meaningfully rerank for risk mode, cadence, asset mix, and available market metrics.
discoveryRank is weak evidence and only a tie-breaker; do not copy the input order.
CoinGecko marketCapRank is a bounded quality signal, not a substitute for liquidity or risk evidence.
Treat null metrics as unknown and never invent missing data.
Return no fields other than regime, top, key, and score.`;

export const PORTFOLIO_DRAFT_SYSTEM_PROMPT = `Create an editable portfolio draft for the supplied investment thesis.
You are a constrained selector, not a researcher. Return one JSON object only with this shape:
{"status":"OK","name":"Draft name","description":"Short explanation","holdings":[{"key":"a000","scoreBps":8000,"reason":"Short factual reason","exposureType":"DIRECT"}]}
Use only candidate keys from the input. Never copy or invent an address, mint, asset ID, price, route, balance, or return.
Return between 1 and maxHoldings unique candidates. maxHoldings is a ceiling, not a target. Prefer relevance over diversification and never add filler.
scoreBps must be an integer from 6000 to 10000. If no candidate scores at least 6000, return {"status":"NO_MATCH","name":"No relevant assets","description":"No supplied candidate has a defensible connection to the thesis.","holdings":[]}.
Use exposureType DIRECT unless the candidate is clearly only a proxy for the thesis; when PROXY is used, include proxyFor.
For a company, stock, medicine, or industry thesis, do not select crypto candidates unless the user explicitly asks for crypto exposure.
Use only the supplied names, classifications, and tags as evidence. Do not invent company fundamentals, partnerships, market data, performance, or returns.
This is a portfolio draft, not a recommendation, guarantee, or execution instruction.
Return no fields outside the documented shape.`;

export const PORTFOLIO_SHORTLIST_SYSTEM_PROMPT = `Shortlist candidates for an editable portfolio draft.
Scan the complete supplied catalog and return one JSON object only: {"keys":["a000"]}.
Return at most 24 unique candidate keys that have a direct or clearly defensible proxy connection to the thesis.
Prefer relevance over diversification. Do not add filler. Return {"keys":[]} when nothing is relevant.
For a company, stock, medicine, or industry thesis, do not select crypto candidates unless the user explicitly asks for crypto exposure.
Use only candidate keys from the input and only the supplied names, classifications, and tags as evidence.
Never copy or invent an address, mint, asset ID, price, route, balance, performance, or return.
Return no fields other than keys.`;

const modelPortfolioShortlistSchema = z
	.object({
		keys: z.array(z.string().regex(/^a\d{3}$/)).max(PORTFOLIO_SHORTLIST_LIMIT),
	})
	.strict();

const modelPortfolioDraftSchema = z
	.object({
		status: z.enum(["OK", "NO_MATCH"]),
		name: z.string().trim().min(3).max(80),
		description: z.string().trim().min(8).max(500),
		holdings: z
			.array(
				z
					.object({
						key: z.string().regex(/^a\d{3}$/),
						scoreBps: z.number().int().min(6_000).max(10_000),
						reason: z.string().trim().min(1).max(280),
						exposureType: z.enum(["DIRECT", "PROXY"]),
						proxyFor: z.string().trim().min(1).max(120).optional(),
					})
					.strict(),
			)
			.max(8),
	})
	.strict();

type RouterBody = {
	choices?: Array<{ message?: { content?: string } }>;
	error?: { message?: string };
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
	};
	x_0g_trace?: {
		tee_verified?: boolean;
		provider?: string;
	};
};

export class ZeroGProvider implements PrivateInferenceProvider {
	private resolvedJsonMode: Exclude<ZeroGJsonMode, "auto"> | undefined;

	constructor(
		private readonly apiKey: string,
		private readonly model = DEFAULT_ZG_MODEL,
		private readonly trustMode: ZeroGTrustMode = "verified",
		private readonly jsonMode: ZeroGJsonMode = "native",
	) {}

	async rank(input: RankingInput) {
		const { modelInput, candidatesByKey } = compactRankingInput(input);
		let transport =
			this.resolvedJsonMode ??
			(this.jsonMode === "auto" ? "native" : this.jsonMode);
		let response = await this.request(modelInput, transport);
		if (
			!response.http.ok &&
			this.jsonMode === "auto" &&
			transport === "native" &&
			response.body.error?.message?.includes("does not support JSON mode")
		) {
			transport = "text";
			this.resolvedJsonMode = "text";
			response = await this.request(modelInput, transport);
		} else if (response.http.ok && this.jsonMode === "auto") {
			this.resolvedJsonMode = transport;
		}
		if (!response.http.ok) {
			throw new Error(
				`ZG_HTTP_${response.http.status}: ${response.body.error?.message ?? "request failed"}`,
			);
		}
		if (this.requiresTee() && response.body.x_0g_trace?.tee_verified !== true) {
			throw new Error("UNVERIFIED_PRIVATE_INFERENCE");
		}

		const raw = modelRankingSchema.parse(
			parseJsonContent(response.body.choices?.[0]?.message?.content),
		);
		const seen = new Set<string>();
		const assets = raw.top.map((asset, index) => {
			const candidate = candidatesByKey.get(asset.key);
			if (!candidate)
				throw new Error(`MODEL_UNKNOWN_CANDIDATE_KEY:${asset.key}`);
			if (seen.has(asset.key))
				throw new Error(`MODEL_DUPLICATE_CANDIDATE_KEY:${asset.key}`);
			seen.add(asset.key);
			return {
				assetId: candidate.assetId,
				rank: index + 1,
				scoreBps: asset.score * 100,
				reason: serverRankingReason(candidate, input, asset.score),
			};
		});
		const output: RankingOutput = {
			schemaVersion: "investmade-ranking-output/v1",
			sessionId: input.sessionId,
			inputCommitment: input.inputCommitment,
			policyVersion: input.policyVersion,
			regime: raw.regime,
			assets,
			warnings: [],
		};
		return {
			output,
			receipt: {
				network: "0G mainnet",
				model: this.model,
				provider: String(response.body.x_0g_trace?.provider ?? "unknown"),
				teeVerified: response.body.x_0g_trace?.tee_verified === true,
				inputCommitment: input.inputCommitment,
				outputCommitment: sha256(output),
				rawOutputCommitment: sha256(raw),
			},
			diagnostics: {
				transport,
				promptTokens: response.body.usage?.prompt_tokens,
				completionTokens: response.body.usage?.completion_tokens,
				returnedAssets: raw.top.length,
			},
		};
	}

	async generatePortfolioDraft(input: PortfolioGenerationModelInput) {
		let shortlist: z.infer<typeof modelPortfolioShortlistSchema> | undefined;
		for (let attempt = 0; attempt < 2; attempt += 1) {
			const response = await this.requestPortfolio(
				"shortlist",
				{
					prompt: input.prompt,
					candidates: input.candidates,
				},
				PORTFOLIO_SHORTLIST_SYSTEM_PROMPT,
				500,
			);
			shortlist = modelPortfolioShortlistSchema.parse(
				parseJsonContent(response.choices?.[0]?.message?.content),
			);
			assertUniquePortfolioKeys(shortlist.keys);
			const suppliedKeys = new Set(input.candidates.map(({ key }) => key));
			for (const key of shortlist.keys) {
				if (!suppliedKeys.has(key)) {
					throw new Error(`MODEL_UNKNOWN_CANDIDATE_KEY:${key}`);
				}
			}
			if (shortlist.keys.length > 0) break;
		}
		if (!shortlist?.keys.length) {
			throw new Error("STRATEGY_NO_RELEVANT_ASSETS");
		}
		const shortlistedKeys = new Set(shortlist.keys);
		const response = await this.requestPortfolio(
			"selection",
			{
				prompt: input.prompt,
				maxHoldings: input.maxHoldings,
				candidates: input.candidates.filter(({ key }) =>
					shortlistedKeys.has(key),
				),
			},
			PORTFOLIO_DRAFT_SYSTEM_PROMPT,
			900,
		);
		const draft = modelPortfolioDraftSchema.parse(
			parseJsonContent(response.choices?.[0]?.message?.content),
		);
		if (draft.status === "NO_MATCH" || draft.holdings.length === 0) {
			throw new Error("STRATEGY_NO_RELEVANT_ASSETS");
		}
		return {
			name: draft.name,
			description: draft.description,
			holdings: draft.holdings,
		};
	}

	private async requestPortfolio(
		stage: "shortlist" | "selection",
		input: unknown,
		systemPrompt: string,
		maxTokens: number,
	): Promise<RouterBody> {
		const headers: Record<string, string> = {
			Authorization: `Bearer ${this.apiKey}`,
			"Content-Type": "application/json",
			"X-0G-Provider-Sort": "latency",
		};
		if (this.trustMode !== "any") {
			headers["X-0G-Provider-Trust-Mode"] = this.trustMode;
		}
		console.info(
			JSON.stringify({
				event: "zero_g_portfolio_request",
				model: this.model,
				stage,
				candidateCount:
					typeof input === "object" && input !== null && "candidates" in input
						? (input as { candidates?: unknown[] }).candidates?.length
						: undefined,
			}),
		);
		const http = await fetch("https://router-api.0g.ai/v1/chat/completions", {
			method: "POST",
			headers,
			body: JSON.stringify({
				model: this.model,
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: JSON.stringify(input) },
				],
				response_format: { type: "json_object" },
				...(this.requiresTee() ? { verify_tee: true } : {}),
				temperature: 0,
				chat_template_kwargs: { enable_thinking: false },
				max_tokens: maxTokens,
				stream: false,
			}),
			signal: AbortSignal.timeout(45_000),
		});
		const body = (await http.json()) as RouterBody;
		if (!http.ok) {
			console.warn(
				JSON.stringify({
					event: "zero_g_portfolio_error",
					model: this.model,
					stage,
					status: http.status,
					message: body.error?.message ?? "request failed",
				}),
			);
			throw new Error(
				`ZG_HTTP_${http.status}: ${body.error?.message ?? "request failed"}`,
			);
		}
		if (this.requiresTee() && body.x_0g_trace?.tee_verified !== true) {
			throw new Error("UNVERIFIED_PRIVATE_INFERENCE");
		}
		console.info(
			JSON.stringify({
				event: "zero_g_portfolio_response",
				model: this.model,
				stage,
				teeVerified: body.x_0g_trace?.tee_verified === true,
			}),
		);
		return body;
	}

	private requiresTee() {
		return this.trustMode === "private" || this.trustMode === "verified";
	}

	private async request(
		modelInput: ReturnType<typeof compactRankingInput>["modelInput"],
		transport: Exclude<ZeroGJsonMode, "auto">,
	) {
		const headers: Record<string, string> = {
			Authorization: `Bearer ${this.apiKey}`,
			"Content-Type": "application/json",
			"X-0G-Provider-Sort": "latency",
		};
		if (this.trustMode !== "any") {
			headers["X-0G-Provider-Trust-Mode"] = this.trustMode;
		}
		const http = await fetch("https://router-api.0g.ai/v1/chat/completions", {
			method: "POST",
			headers,
			body: JSON.stringify({
				model: this.model,
				messages: [
					{ role: "system", content: RANKING_SYSTEM_PROMPT },
					{ role: "user", content: JSON.stringify(modelInput) },
				],
				...(transport === "native"
					? { response_format: { type: "json_object" } }
					: {}),
				...(this.requiresTee() ? { verify_tee: true } : {}),
				temperature: 0.2,
				chat_template_kwargs: { enable_thinking: false },
				max_tokens: 400,
				stream: false,
			}),
			signal: AbortSignal.timeout(45_000),
		});
		return {
			http,
			body: (await http.json()) as RouterBody,
		};
	}
}

function serverRankingReason(
	candidate: RankingCandidate,
	input: RankingInput,
	score: number,
): string {
	const signals: string[] = [];
	if (candidate.priceChange24hPct !== undefined) {
		const change = candidate.priceChange24hPct;
		signals.push(`${change >= 0 ? "+" : ""}${change.toFixed(1)}% 24h move`);
	}
	if (candidate.volume24hUsd !== undefined) {
		signals.push(`${formatCompactUsd(candidate.volume24hUsd)} 24h volume`);
	}
	if (candidate.marketCapRank !== undefined) {
		signals.push(`CoinGecko market-cap rank #${candidate.marketCapRank}`);
	}
	const evidence =
		signals.length > 0
			? signals.join(" and ")
			: `${candidate.kind === "CRYPTO" ? "crypto" : "tokenized-stock"} market data`;
	return `${candidate.symbol} scored ${score}/100 for your ${input.preferences.riskMode} ${input.preferences.cadence} plan, using ${evidence}.`;
}

function formatCompactUsd(value: number): string {
	return `$${Intl.NumberFormat("en", {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value)}`;
}

export function compactRankingInput(input: RankingInput) {
	const candidates = input.candidates
		.slice(0, MODEL_CANDIDATE_LIMIT)
		.map((candidate, index) => ({
			key: `c${String(index + 1).padStart(2, "0")}`,
			symbol: candidate.symbol,
			type:
				candidate.kind === "CRYPTO" ? ("crypto" as const) : ("stock" as const),
			discoveryRank: candidate.discoveryRank,
			classification: candidate.primaryClassification,
			classificationConfidence: candidate.classificationConfidence,
			priceUsd: candidate.priceUsd ?? null,
			volume24hUsd: candidate.volume24hUsd ?? null,
			liquidityUsd: candidate.liquidityUsd ?? null,
			organicScore: candidate.organicScore ?? null,
			marketCapRank: candidate.marketCapRank ?? null,
			change24hPct: candidate.priceChange24hPct ?? null,
			riskFlags: candidate.riskFlags,
		}));
	return {
		modelInput: {
			preferences: {
				cadence: input.preferences.cadence,
				risk: input.preferences.riskMode,
				ticketUsd: input.preferences.ticketSizeUsd,
				assetMix: input.preferences.assetClasses.map((kind) =>
					kind === "CRYPTO" ? ("crypto" as const) : ("stock" as const),
				),
			},
			candidates,
		},
		candidatesByKey: new Map<string, RankingCandidate>(
			candidates.map((candidate, index) => [
				candidate.key,
				input.candidates[index] as RankingCandidate,
			]),
		),
	};
}

function parseJsonContent(content: unknown): unknown {
	if (typeof content !== "string") throw new Error("ZG_CONTENT_MISSING");
	const trimmed = content.trim();
	const withoutFence = trimmed
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/, "");
	return JSON.parse(withoutFence);
}

function assertUniquePortfolioKeys(keys: readonly string[]) {
	const seen = new Set<string>();
	for (const key of keys) {
		if (seen.has(key)) {
			throw new Error(`MODEL_DUPLICATE_CANDIDATE_KEY:${key}`);
		}
		seen.add(key);
	}
}
