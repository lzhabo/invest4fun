import { randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { performance } from "node:perf_hooks";
import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { formatUnits } from "viem";
import { ZodError, z } from "zod";
import { sha256 } from "../domain/canonical.js";
import {
	AI_RANKING_POOL_SIZE,
	FEED_PAGE_SIZE,
	ONBOARDING_VERSION,
	POLICY_VERSION,
} from "../domain/constants.js";
import { executionIntent } from "../domain/execution-intent.js";
import {
	eligibleFeedCandidates,
	hasCanonicalExecutionAssetId,
	PolicyError,
	policyHash,
	unavailableExecutionAssetIds,
	validateExecutionAssets,
	validateExecutionSelection,
	validateFeed,
	validateRanking,
} from "../domain/policy.js";
import {
	appChainSchema,
	budgetForTicket,
	type Candidate,
	DEFAULT_BUDGET,
	type ExecutionProviderId,
	executionProviderIdSchema,
	executionRequestSchema,
	type FeedRankingProviderId,
	feedInputSchema,
	feedRankingProviderIdSchema,
	onboardingPreferencesSchema,
	personalizationPreferencesSchema,
	type RankingInput,
	rankingInputSchema,
	solanaAddressSchema,
} from "../domain/schemas.js";
import {
	SOLANA_ASSET_REGISTRY,
	SOLANA_CLUSTER,
	SOLANA_NATIVE_MINT,
	SOLANA_USDC_ASSET,
	SOLANA_USDC_DECIMALS,
	SOLANA_USDC_MINT,
	solanaAssetById,
} from "../domain/solana.js";
import { CONTENT_SECURITY_POLICY_DIRECTIVES } from "../security-headers.js";
import type {
	AssetIconProvider,
	MarketDataProvider,
} from "./adapters/coingecko.js";
import type { HistoryPeriod, PricePoint } from "./adapters/market-history.js";
import type {
	CandidateProvider,
	ExecutionProvider,
	PrivateInferenceProvider,
} from "./adapters/types.js";
import { ExecutionProviderError } from "./adapters/types.js";
import type { ExecutionActor } from "./auth.js";
import { PrivyWalletAuth } from "./auth.js";
import { broadcastPreparedExecution } from "./broadcast-execution.js";
import type { AppConfig } from "./config.js";
import {
	assertCanonicalExecutionOwner,
	assertPlanQuotesFresh,
	LivePurchaseSafetyError,
} from "./live-purchase-safety.js";
import {
	loadPortfolioMetadata,
	persistPortfolioMetadata,
	portfolioTokenFallbackName,
} from "./portfolio-metadata.js";
import { publicExecution } from "./public-execution.js";
import { reconcileExecution } from "./reconcile-execution.js";
import { sessionEpochId } from "./session-epoch.js";
import type { StateStore } from "./store.js";

export interface AppDependencies {
	config: AppConfig;
	store: StateStore;
	candidates: CandidateProvider;
	inference: PrivateInferenceProvider;
	rankingProviders?: Partial<
		Record<FeedRankingProviderId, PrivateInferenceProvider>
	>;
	execution: ExecutionProvider;
	solanaExecutionProviders?: Partial<
		Record<ExecutionProviderId, ExecutionProvider>
	>;
	solanaCandidateProviders?: Partial<
		Record<ExecutionProviderId, CandidateProvider>
	>;
	auth?: {
		actor(request: Request): Promise<
			| ExecutionActor
			| {
					wallet: string;
					txOrigin: string;
					userId?: string;
					chain?: "SOLANA";
			  }
		>;
	};
	icons?: AssetIconProvider;
	marketData?: MarketDataProvider;
	history?: Pick<MarketDataProvider, "history">;
	fetcher?: typeof fetch;
}

async function candidatesForExactAmounts(
	provider: CandidateProvider,
	wallet: string,
	selections: Array<{ assetId: string; amountInBaseUnits: string }>,
	txOrigin?: string,
) {
	const now = new Date();
	const resolved: Candidate[] = [];
	for (const selection of selections) {
		const candidates = await provider.getCandidatesForExecution(
			wallet,
			[selection.assetId],
			selection.amountInBaseUnits,
			now,
			txOrigin,
		);
		const candidate = candidates.find(
			(item) => item.assetId === selection.assetId,
		);
		if (candidate) resolved.push(candidate);
	}
	return resolved;
}

export function createApp(deps: AppDependencies) {
	const app = express();
	// Vercel terminates the public request before it reaches this function.
	// Trust exactly that proxy hop so rate limiting keys off the real client IP.
	if (deps.config.NODE_ENV === "production") app.set("trust proxy", 1);
	const auth =
		deps.auth ??
		new PrivyWalletAuth(deps.config.PRIVY_APP_ID, deps.config.PRIVY_APP_SECRET);
	app.disable("x-powered-by");
	app.use(
		helmet({
			contentSecurityPolicy: {
				directives: CONTENT_SECURITY_POLICY_DIRECTIVES,
			},
			xFrameOptions: { action: "deny" },
		}),
	);
	app.use(express.json({ limit: "64kb" }));
	app.use(
		"/api",
		rateLimit({
			windowMs: 60_000,
			limit:
				deps.config.NODE_ENV === "production" && deps.config.liveExecution
					? 60
					: 240,
			standardHeaders: "draft-8",
			legacyHeaders: false,
		}),
	);

	app.get("/api/health", (_request, response) => {
		response.json({
			status: "ok",
			mode: deps.config.localLiveExecution
				? "local-live"
				: deps.config.demoMode
					? "demo"
					: "live",
			chain: "SOLANA",
			cluster: SOLANA_CLUSTER,
		});
	});

	app.get("/api/cron/reconcile", async (request, response) => {
		if (!deps.config.CRON_SECRET) {
			response
				.status(503)
				.json({ error: "RECONCILIATION_CRON_NOT_CONFIGURED" });
			return;
		}
		if (
			!hasBearerSecret(request.headers.authorization, deps.config.CRON_SECRET)
		) {
			response.status(401).json({ error: "UNAUTHORIZED" });
			return;
		}
		if (!deps.config.liveExecution) {
			response.json({ scanned: 0, terminal: 0, pending: 0, failed: 0 });
			return;
		}

		const executions = await deps.store.listExecutionsForReconciliation(
			deps.config.RECONCILIATION_BATCH_SIZE,
		);
		let terminal = 0;
		let pending = 0;
		let failed = 0;
		for (const execution of executions) {
			try {
				const session = await deps.store.getSession(execution.plan.sessionId);
				if (!session || session.executionProvider !== execution.plan.provider) {
					throw new Error("EXECUTION_CONTEXT_MISMATCH");
				}
				const result = await reconcileExecution({
					execution,
					session,
					provider: executionProvider(deps, execution.plan.provider),
					store: deps.store,
				});
				if (result.pending) pending += 1;
				else terminal += 1;
			} catch {
				failed += 1;
			}
		}
		response.json({ scanned: executions.length, terminal, pending, failed });
	});

	app.get("/api/config", (_request, response) => {
		response.json({
			demoMode: !deps.config.liveExecution,
			executionMode: deps.config.localLiveExecution
				? "local-live"
				: deps.config.demoMode
					? "demo"
					: "live",
			chain: "SOLANA",
			cluster: SOLANA_CLUSTER,
			stableToken: "USDC",
			inputMint: SOLANA_USDC_MINT,
			livePurchasesEnabled:
				deps.config.liveExecution && deps.config.livePurchasesEnabled,
			liveBroadcastEnabled:
				deps.config.liveExecution && deps.config.liveBroadcastEnabled,
			executionProviders: {
				JUPITER: {
					available: providerConfigured(deps.config, "JUPITER"),
				},
			},
			feedRankingProviders: {
				ZERO_G: { available: Boolean(deps.rankingProviders?.ZERO_G) },
				DETERMINISTIC: { available: true },
			},
			periodBudgetBaseUnits: DEFAULT_BUDGET.periodBudgetBaseUnits,
			slotBudgetBaseUnits: DEFAULT_BUDGET.slotBudgetBaseUnits,
			maxCards: DEFAULT_BUDGET.maxCards,
			privy: { appId: deps.config.PRIVY_APP_ID },
		});
	});

	app.post("/api/solana/rpc", async (request, response) => {
		if (!deps.config.SOLANA_RPC_URL) {
			response.status(503).json({ error: "SOLANA_UNAVAILABLE" });
			return;
		}
		const allowedMethods = new Set([
			"getAccountInfo",
			"getBalance",
			"getBlockHeight",
			"getFeeForMessage",
			"getGenesisHash",
			"getLatestBlockhash",
			"getMinimumBalanceForRentExemption",
			"getMultipleAccounts",
			"getRecentPrioritizationFees",
			"getSignatureStatuses",
			"getTokenAccountBalance",
			"getTokenAccountsByOwner",
			"getVersion",
			"simulateTransaction",
		]);
		const calls = Array.isArray(request.body) ? request.body : [request.body];
		if (
			!calls.length ||
			calls.some(
				(call) =>
					!call ||
					typeof call !== "object" ||
					typeof call.method !== "string" ||
					!allowedMethods.has(call.method),
			)
		) {
			response.status(403).json({ error: "SOLANA_RPC_METHOD_NOT_ALLOWED" });
			return;
		}
		const upstream = await (deps.fetcher ?? fetch)(deps.config.SOLANA_RPC_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(request.body),
		});
		response
			.status(upstream.status)
			.type("application/json")
			.set("Cache-Control", "no-store")
			.send(await upstream.text());
	});

	app.get("/api/assets/icons", async (_request, response) => {
		try {
			response.json({ icons: (await deps.icons?.getIcons()) ?? {} });
		} catch {
			response.json({ icons: {} });
		}
	});

	app.get("/api/assets/:assetId/history", async (request, response) => {
		const assetId = String(request.params.assetId);
		const period = z
			.enum(["1H", "1D", "1W", "1M", "3M", "1Y", "ALL"])
			.default("1W")
			.parse(request.query.period) as HistoryPeriod;
		const asset = await resolveAsset(deps, assetId);
		if (!asset) {
			response.status(404).json({ error: "ASSET_NOT_FOUND" });
			return;
		}
		try {
			const history = await deps.history?.history(asset, period);
			if (history && history.points.length >= 2) {
				response.json({
					period,
					requestedPeriod: period,
					effectivePeriod:
						period === "ALL"
							? history.isCompleteHistory
								? "MAX"
								: "LIMITED"
							: period,
					coverageStart: history.points[0]?.timestamp,
					coverageEnd: history.points.at(-1)?.timestamp,
					...history,
				});
				return;
			}
		} catch {
			// Charts are enrichment; review and execution flows must remain available.
		}
		// Keep local demos usable if CoinGecko market history is temporarily down.
		if (!deps.config.liveExecution) {
			response.json({
				period,
				source: "demo",
				points: demoHistory(asset.symbol, period),
				isCompleteHistory: false,
			});
			return;
		}
		response.json({
			period,
			source: "unavailable",
			points: [],
			isCompleteHistory: false,
		});
	});

	app.get("/api/assets/:assetId/details", async (request, response) => {
		const assetId = String(request.params.assetId);
		const asset = await resolveAsset(deps, assetId);
		if (!asset) {
			response.status(404).json({ error: "ASSET_NOT_FOUND" });
			return;
		}
		const explorerUrl = assetExplorerUrl(assetId, asset.address);
		const common = {
			assetId,
			...(explorerUrl
				? {
						contract: asset.address,
						explorerUrl,
					}
				: {}),
		};
		try {
			const details = await deps.marketData?.details?.(asset);
			if (details) {
				response.json({ ...common, ...details });
				return;
			}
		} catch {
			// Metadata is optional; the contract explorer remains useful on failure.
		}
		response.json({
			...common,
			source: "unavailable",
			categories: [],
			community: [],
		});
	});

	app.get("/api/balances/:address/solana", async (request, response) => {
		const address = solanaAddressSchema.parse(request.params.address);
		if (!deps.config.SOLANA_RPC_URL) {
			response.status(503).json({ error: "SOLANA_UNAVAILABLE" });
			return;
		}
		const fetcher = deps.fetcher ?? fetch;
		const [native, usdcBalanceBaseUnits, solPriceUsd] = await Promise.all([
			solanaRpc<{ value?: number }>(fetcher, deps.config.SOLANA_RPC_URL, {
				id: 1,
				method: "getBalance",
				params: [address, { commitment: "confirmed" }],
			}),
			solanaUsdcBalance(fetcher, deps.config.SOLANA_RPC_URL, address),
			solanaUsdPrice(
				fetcher,
				deps.config.COINGECKO_API_KEY,
				deps.config.JUPITER_API_KEY,
			),
		]);
		response.json({
			cluster: SOLANA_CLUSTER,
			address,
			solBalanceLamports: String(native.value ?? 0),
			...(solPriceUsd === undefined ? {} : { solPriceUsd }),
			usdcBalanceBaseUnits: usdcBalanceBaseUnits.toString(),
			usdcDecimals: SOLANA_USDC_DECIMALS,
		});
	});

	app.get("/api/portfolio/:address/solana", async (request, response) => {
		const address = solanaAddressSchema.parse(request.params.address);
		const endpoint = alchemyPortfolioEndpoint(deps.config.SOLANA_RPC_URL);
		if (!endpoint) {
			response.status(503).json({ error: "ALCHEMY_PORTFOLIO_UNAVAILABLE" });
			return;
		}
		const fetcher = deps.fetcher ?? fetch;
		const deadlineSignal = AbortSignal.timeout(8_000);
		const tokens: AlchemyPortfolioToken[] = [];
		let pageKey: string | undefined;
		for (let page = 0; page < 5; page += 1) {
			const upstream = await fetcher(endpoint, {
				method: "POST",
				signal: deadlineSignal,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					addresses: [{ address, networks: ["solana-mainnet"] }],
					withMetadata: true,
					withPrices: true,
					includeNativeTokens: true,
					includeErc20Tokens: true,
					...(pageKey ? { pageKey } : {}),
				}),
			});
			if (!upstream.ok) {
				response.status(upstream.status === 429 ? 429 : 502).json({
					error:
						upstream.status === 429
							? "ALCHEMY_RATE_LIMITED"
							: "ALCHEMY_PORTFOLIO_UNAVAILABLE",
				});
				return;
			}
			const payload = (await upstream.json()) as AlchemyPortfolioResponse;
			tokens.push(...(payload.data?.tokens ?? []));
			pageKey = payload.data?.pageKey || undefined;
			if (!pageKey) break;
		}
		const knownByMint = new Map(
			Object.values(SOLANA_ASSET_REGISTRY).map((asset) => [
				asset.address,
				asset,
			]),
		);
		const persistedByMint = new Map(
			await Promise.all(
				tokens.map(async (token) => {
					const mint = token.tokenAddress ?? SOLANA_NATIVE_MINT;
					return [mint, await loadPortfolioMetadata(deps.store, mint)] as const;
				}),
			),
		);
		const unresolvedAssetIds = tokens.flatMap((token) => {
			const mint = token.tokenAddress ?? SOLANA_NATIVE_MINT;
			return knownByMint.has(mint) ||
				mint === SOLANA_USDC_MINT ||
				persistedByMint.get(mint)
				? []
				: [`sol:mainnet:${mint}`];
		});
		if (unresolvedAssetIds.length && deps.candidates.getCandidatesForDisplay) {
			try {
				const resolved =
					await deps.candidates.getCandidatesForDisplay(unresolvedAssetIds);
				for (const candidate of resolved) {
					persistedByMint.set(candidate.contract, {
						assetId: candidate.assetId,
						mint: candidate.contract,
						symbol: candidate.symbol,
						name: candidate.name,
						decimals: candidate.decimals,
						iconUrl: candidate.iconUrl,
					});
				}
				await persistPortfolioMetadata(deps.store, resolved).catch(
					() => undefined,
				);
			} catch {
				// Portfolio balances remain visible with a mint-based fallback.
			}
		}
		response.json({
			cluster: SOLANA_CLUSTER,
			address,
			tokens: tokens
				.map((token) => {
					const mint = token.tokenAddress ?? SOLANA_NATIVE_MINT;
					const known = knownByMint.get(mint);
					const stablecoin =
						mint === SOLANA_USDC_MINT ? SOLANA_USDC_ASSET : undefined;
					const persisted = persistedByMint.get(mint);
					const balanceBaseUnits = hexBalanceToDecimal(token.tokenBalance);
					const usdPrice = token.tokenPrices?.find(
						(price) => price.currency.toLowerCase() === "usd",
					);
					const iconUrls = [
						persisted?.iconUrl,
						token.tokenMetadata?.logo,
					].filter(
						(icon, index, icons): icon is string =>
							Boolean(icon) && icons.indexOf(icon) === index,
					);
					return {
						assetId:
							known?.assetId ??
							stablecoin?.assetId ??
							persisted?.assetId ??
							`sol:mainnet:${mint}`,
						mint,
						symbol:
							known?.symbol ??
							stablecoin?.symbol ??
							persisted?.symbol ??
							token.tokenMetadata?.symbol ??
							"TOKEN",
						name:
							known?.name ??
							stablecoin?.name ??
							persisted?.name ??
							token.tokenMetadata?.name ??
							portfolioTokenFallbackName(mint),
						decimals:
							known?.decimals ??
							stablecoin?.decimals ??
							persisted?.decimals ??
							token.tokenMetadata?.decimals ??
							0,
						balanceBaseUnits,
						iconUrl: iconUrls[0],
						iconUrls,
						explorerUrl: `https://solscan.io/token/${mint}`,
						priceUsd: usdPrice
							? Number(usdPrice.value)
							: stablecoin
								? 1
								: undefined,
						priceUpdatedAt: usdPrice?.lastUpdatedAt,
					};
				})
				.filter((token) => BigInt(token.balanceBaseUnits) > 0n),
		});
	});

	const requireWallet = async (
		request: Request,
		response: Response,
		next: NextFunction,
	) => {
		if (!deps.config.liveExecution) {
			response.locals.chain = "SOLANA";
			response.locals.wallet = "11111111111111111111111111111111";
			response.locals.txOrigin = response.locals.wallet;
			response.locals.userId = `demo:${response.locals.wallet}`;
			next();
			return;
		}
		try {
			const actor = await auth.actor(request);
			response.locals.wallet = actor.wallet;
			response.locals.txOrigin = actor.txOrigin;
			response.locals.userId = actor.userId ?? actor.wallet;
			response.locals.chain = "SOLANA";
			next();
		} catch {
			response.status(401).json({ error: "AUTH_REQUIRED" });
		}
	};

	const requireFeedWallet = async (
		request: Request,
		response: Response,
		next: NextFunction,
	) => {
		if (deps.config.demoMode && !request.header("authorization")) {
			response.locals.wallet = "11111111111111111111111111111111";
			response.locals.txOrigin = response.locals.wallet;
			response.locals.userId = `demo:${response.locals.wallet}`;
			response.locals.chain = "SOLANA";
			next();
			return;
		}
		await requireWallet(request, response, next);
	};
	const preferenceOwner = (response: Response) =>
		String(response.locals.userId ?? response.locals.wallet);
	const assertCanonicalOwner = async (
		response: Response,
		session?: Parameters<typeof assertCanonicalExecutionOwner>[0]["session"],
	) => {
		if (!deps.config.liveExecution) return;
		const actorUserId = preferenceOwner(response);
		assertCanonicalExecutionOwner({
			account: await deps.store.getAccount(actorUserId),
			actorUserId,
			actorWallet: String(response.locals.wallet),
			session,
		});
	};
	const preferencesFor = async (response: Response) => {
		const ownerId = preferenceOwner(response);
		const byOwner = await deps.store.getPreferences(ownerId);
		if (byOwner || ownerId === response.locals.wallet) return byOwner;
		return deps.store.getPreferences(response.locals.wallet);
	};
	const timezoneSchema = z
		.string()
		.min(1)
		.max(100)
		.refine((timezone) => {
			try {
				Intl.DateTimeFormat("en", { timeZone: timezone });
				return true;
			} catch {
				return false;
			}
		}, "Invalid IANA timezone");

	app.post(
		"/api/account/bootstrap",
		requireWallet,
		async (request, response) => {
			const timezone = timezoneSchema.parse(request.body?.timezone);
			try {
				response.json(
					await deps.store.getOrCreateAccount(
						preferenceOwner(response),
						response.locals.wallet,
						timezone,
					),
				);
			} catch (error) {
				if (
					error instanceof Error &&
					error.message === "CANONICAL_WALLET_MISMATCH"
				) {
					response.status(409).json({
						error: "CANONICAL_WALLET_MISMATCH",
						message:
							"Your investment wallet changed. Reconnect the original wallet or start account recovery.",
					});
					return;
				}
				throw error;
			}
		},
	);

	app.post("/api/preferences", requireWallet, async (request, response) => {
		const preferences = onboardingPreferencesSchema.parse(request.body);
		if (preferences.activeChain !== "SOLANA") {
			response.status(422).json({
				error: "SOLANA_ONLY",
				message: "New preferences are available on Solana only.",
			});
			return;
		}
		if (
			preferences.activeChain !== response.locals.chain ||
			preferences.executionProvider !== "JUPITER"
		) {
			response.status(409).json({ error: "CHAIN_WALLET_MISMATCH" });
			return;
		}
		if (!providerConfigured(deps.config, preferences.executionProvider)) {
			response.status(422).json({
				error: "EXECUTION_PROVIDER_UNAVAILABLE",
				message: `${providerLabel(preferences.executionProvider)} is not configured.`,
				provider: preferences.executionProvider,
			});
			return;
		}
		const storedPreferences =
			preferences.activeChain === "SOLANA"
				? { ...preferences, solanaExecutionWallet: response.locals.wallet }
				: preferences;
		const ownerId = preferenceOwner(response);
		const existing = await preferencesFor(response);
		if (
			existing &&
			(existing.executionProvider !== storedPreferences.executionProvider ||
				existing.feedRankingProvider !== storedPreferences.feedRankingProvider)
		) {
			await deps.store.invalidatePreparedExecutions(ownerId);
		}
		const saved = await deps.store.setPreferences(
			ownerId,
			storedPreferences,
			response.locals.wallet,
		);
		await deps.store.completeAccountOnboarding(
			ownerId,
			response.locals.wallet,
			ONBOARDING_VERSION,
		);
		response.json(saved);
	});

	app.get("/api/preferences", requireWallet, async (_request, response) => {
		const preferences = await preferencesFor(response);
		if (!preferences) {
			response.status(404).json({ error: "PREFERENCES_NOT_FOUND" });
			return;
		}
		response.json(preferences);
	});

	app.post(
		"/api/sessions/open",
		requireFeedWallet,
		async (request, response) => {
			const cadence = personalizationPreferencesSchema.shape.cadence.parse(
				request.body?.cadence,
			);
			const storedPreferences = await preferencesFor(response);
			const account = await deps.store.getAccount(preferenceOwner(response));
			await assertCanonicalOwner(response);
			const chain =
				storedPreferences?.activeChain ??
				appChainSchema.optional().default("SOLANA").parse(request.body?.chain);
			if (chain !== "SOLANA") {
				response.status(422).json({
					error: "SOLANA_ONLY",
					message: "New sessions are available on Solana only.",
				});
				return;
			}
			const executionProvider =
				storedPreferences?.executionProvider ??
				executionProviderIdSchema
					.optional()
					.default("JUPITER")
					.parse(request.body?.executionProvider);
			const feedRankingProvider =
				storedPreferences?.feedRankingProvider ??
				feedRankingProviderIdSchema
					.optional()
					.default("ZERO_G")
					.parse(request.body?.feedRankingProvider);
			const session = await deps.store.openSession(
				response.locals.wallet,
				sessionEpochId(
					cadence,
					deps.config,
					undefined,
					account?.timezone ?? "UTC",
				),
				executionProvider,
				chain,
				preferenceOwner(response),
				feedRankingProvider,
			);
			response.json(session);
		},
	);

	app.post(
		"/api/sessions/:sessionId/feed",
		requireFeedWallet,
		async (request, response) => {
			const timing = serverTiming("feed", deps.config.NODE_ENV !== "test");
			const session = await deps.store.getSession(
				String(request.params.sessionId),
			);
			if (
				!session ||
				session.wallet !== response.locals.wallet ||
				session.chain !== response.locals.chain
			) {
				response.status(404).json({ error: "SESSION_NOT_FOUND" });
				return;
			}
			const currentPreferences = await preferencesFor(response);
			if (
				currentPreferences &&
				(currentPreferences.executionProvider !== session.executionProvider ||
					currentPreferences.activeChain !== session.chain ||
					currentPreferences.feedRankingProvider !==
						session.feedRankingProvider)
			) {
				response.status(409).json({
					error: "EXECUTION_PROVIDER_CHANGED",
					message:
						"Your execution provider changed. Refresh the basket before continuing.",
				});
				return;
			}
			const submittedPreferences = onboardingPreferencesSchema.parse(
				request.body,
			);
			if (
				submittedPreferences.executionProvider !== session.executionProvider ||
				submittedPreferences.activeChain !== session.chain ||
				submittedPreferences.feedRankingProvider !== session.feedRankingProvider
			) {
				response.status(409).json({
					error: "EXECUTION_PROVIDER_CHANGED",
					message:
						"Your execution provider changed. Refresh the basket before continuing.",
				});
				return;
			}
			const candidatesForSession = candidateProvider(
				deps,
				session.executionProvider,
			);
			const budget = budgetForTicket(
				submittedPreferences.ticketSizeUsd,
				submittedPreferences.periodLimitUsd ?? 100,
			);
			const candidateLimit =
				z
					.number()
					.int()
					.min(1)
					.max(FEED_PAGE_SIZE)
					.optional()
					.parse(request.body?.candidateLimit) ?? FEED_PAGE_SIZE;
			const excludedAssetIds =
				z
					.array(z.string().min(1))
					.optional()
					.parse(request.body?.excludedAssetIds) ?? [];
			const { riskDisclosureAccepted: _accepted, ...preferences } =
				submittedPreferences;
			timing.mark("session");
			let rankingCandidates = (
				await candidatesForSession.getRankingCandidates(
					AI_RANKING_POOL_SIZE,
					excludedAssetIds,
					{
						includeCommunity: preferences.riskMode === "degen",
						riskMode: preferences.riskMode,
					},
				)
			).filter((candidate) =>
				preferences.assetClasses.includes(candidate.kind),
			);
			if (deps.marketData) {
				try {
					rankingCandidates =
						await deps.marketData.enrichRankingCandidates(rankingCandidates);
				} catch (error) {
					if (session.chain !== "SOLANA") throw error;
					console.warn(
						JSON.stringify({
							event: "market_enrichment_unavailable",
							chain: session.chain,
							reason: error instanceof Error ? error.message : String(error),
						}),
					);
				}
			}
			if (!rankingCandidates.length) {
				response
					.status(422)
					.json({ error: "NO_ELIGIBLE_CANDIDATES_FOR_PREFERENCES" });
				return;
			}
			timing.mark("market");
			const unsignedRankingInput = {
				schemaVersion: "investmade-ranking-input/v1" as const,
				sessionId: session.id,
				epochId: session.epochId,
				policyVersion: POLICY_VERSION,
				budget,
				preferences,
				candidates: rankingCandidates,
			};
			const rankingInput = rankingInputSchema.parse({
				...unsignedRankingInput,
				inputCommitment: sha256(unsignedRankingInput),
			});
			const generated = await rankFeed(
				deps,
				submittedPreferences.feedRankingProvider,
				rankingInput,
			);
			const ranking = validateRanking(
				generated.output,
				rankingInput,
				rankingCandidates,
			);
			timing.mark("inference");
			const pageSize = Math.min(candidateLimit, budget.maxCards);
			const discoveredCandidates =
				await candidatesForSession.getCandidatesForFeed(
					response.locals.wallet,
					ranking.assets.map((asset) => asset.assetId),
					budget.slotBudgetBaseUnits,
					new Date(),
					pageSize,
					response.locals.txOrigin,
				);
			const marketById = new Map(
				rankingCandidates.map((candidate) => [candidate.assetId, candidate]),
			);
			const marketCandidates = discoveredCandidates.map((candidate) => {
				const market = marketById.get(candidate.assetId);
				if (!market) return candidate;
				return {
					...candidate,
					marketPriceUsd: market.priceUsd ?? candidate.marketPriceUsd,
					volume24hUsd: market.volume24hUsd,
					liquidityUsd: market.liquidityUsd,
					providerVolumeRank: market.providerVolumeRank,
					providerVolumeRankTotal: market.providerVolumeRankTotal,
					marketDataSource:
						market.marketDataSource ?? candidate.marketDataSource,
					marketCapRank: market.marketCapRank,
					marketCapRankSource: market.marketCapRankSource,
					coingeckoId: market.coingeckoId,
					iconUrl: market.iconUrl ?? candidate.iconUrl,
					marketDataUpdatedAt: market.marketDataUpdatedAt,
					primaryClassification: market.primaryClassification,
					classificationConfidence: market.classificationConfidence,
					tags: market.tags,
					riskFlags: market.riskFlags,
					classificationEvidence: market.classificationEvidence,
					evidenceIds: [
						...candidate.evidenceIds,
						...(market.coingeckoId
							? [`coingecko:market:${market.coingeckoId}`]
							: []),
					],
				};
			});
			const candidates = eligibleFeedCandidates(marketCandidates).slice(
				0,
				pageSize,
			);
			if (!candidates.length) {
				response
					.status(422)
					.json({ error: "NO_ELIGIBLE_CANDIDATES_FOR_PREFERENCES" });
				return;
			}
			const rankingById = new Map(
				ranking.assets.map((asset) => [asset.assetId, asset]),
			);
			const input = feedInputSchema.parse({
				schemaVersion: "investmade-feed-input/v1",
				sessionId: session.id,
				epochId: session.epochId,
				policyVersion: POLICY_VERSION,
				budget,
				preferences,
				candidates,
				inputCommitment: rankingInput.inputCommitment,
			});
			const output = validateFeed(
				{
					schemaVersion: "investmade-feed-output/v1",
					sessionId: session.id,
					inputCommitment: rankingInput.inputCommitment,
					policyVersion: POLICY_VERSION,
					regime: ranking.regime,
					cards: candidates.map((candidate, index) => {
						const ranked = rankingById.get(candidate.assetId);
						if (!ranked) {
							throw new PolicyError(
								"ASSET_NOT_ELIGIBLE",
								`${candidate.assetId} was not present in the verified ranking.`,
							);
						}
						return {
							assetId: candidate.assetId,
							action: "BUY" as const,
							rank: index + 1,
							amountInBaseUnits: budget.slotBudgetBaseUnits,
							scoreBps: ranked.scoreBps,
							marketCapRank: candidate.marketCapRank,
							marketCapRankSource: candidate.marketCapRankSource,
							evidenceIds: candidate.evidenceIds,
							reason: ranked.reason,
						};
					}),
					warnings: ranking.warnings,
				},
				input,
				candidates,
			);
			timing.mark("cards");
			timing.apply(response);
			response.json({
				candidates,
				feed: output,
				proof: generated.receipt,
				hasMore:
					candidates.length === pageSize &&
					ranking.assets.length > candidates.length,
				rankedAssetCount: ranking.assets.length,
			});
		},
	);

	app.get(
		"/api/sessions/:sessionId/budget",
		requireFeedWallet,
		async (request, response) => {
			const session = await deps.store.getSession(
				String(request.params.sessionId),
			);
			if (
				!session ||
				session.wallet !== response.locals.wallet ||
				session.ownerId.toLowerCase() !==
					preferenceOwner(response).toLowerCase()
			) {
				response.status(404).json({ error: "SESSION_NOT_FOUND" });
				return;
			}
			response.json({
				epochId: session.epochId,
				usedBaseUnits: await deps.store.getPeriodBudgetUsage(
					session.ownerId,
					session.epochId,
				),
			});
		},
	);

	app.post(
		"/api/executions/prepare",
		requireWallet,
		async (request, response) => {
			if (deps.config.liveExecution && !deps.config.livePurchasesEnabled) {
				response.status(503).json({
					error: "LIVE_PURCHASES_DISABLED",
					message: "Live purchase preparation is temporarily disabled.",
				});
				return;
			}
			const timing = serverTiming("prepare", deps.config.NODE_ENV !== "test");
			const parsed = executionRequestSchema.parse(request.body);
			const session = await deps.store.getSession(parsed.sessionId);
			if (
				!session ||
				session.wallet !== response.locals.wallet ||
				session.chain !== response.locals.chain ||
				session.chain !== parsed.chain
			) {
				response.status(404).json({ error: "SESSION_NOT_FOUND" });
				return;
			}
			await assertCanonicalOwner(response, session);
			const currentPreferences = await preferencesFor(response);
			if (
				currentPreferences &&
				parsed.periodLimitUsd !== currentPreferences.periodLimitUsd
			) {
				response.status(409).json({
					error: "PERIOD_LIMIT_CHANGED",
					message:
						"Your weekly investment limit changed. Refresh the basket before continuing.",
				});
				return;
			}
			if (
				currentPreferences &&
				(currentPreferences.executionProvider !== session.executionProvider ||
					currentPreferences.activeChain !== session.chain)
			) {
				response.status(409).json({
					error: "EXECUTION_PROVIDER_CHANGED",
					message:
						"Your execution provider changed. Refresh the basket before continuing.",
				});
				return;
			}
			const executionForSession = executionProvider(
				deps,
				session.executionProvider,
			);
			const candidatesForSession = candidateProvider(
				deps,
				session.executionProvider,
			);
			const requestedIntent = executionIntent(
				{
					...session,
					chain: "SOLANA",
					executionProvider: session.executionProvider,
				},
				parsed,
			);
			const requestedPlanHash = sha256(requestedIntent);
			let expectedPlanHash: string = requestedPlanHash;
			if (session.executionId) {
				const existing = await deps.store.getExecution(session.executionId);
				if (!existing) {
					response.status(409).json({
						error: "EXECUTION_NOT_FOUND",
						executionId: session.executionId,
					});
					return;
				}
				if (existing.status !== "PREPARED") {
					response.status(409).json({
						error: "EXECUTION_TERMINAL",
						message:
							"This basket has already been submitted. Open its receipt or start another basket.",
						executionId: existing.plan.executionId,
						status: existing.status,
					});
					return;
				}
				expectedPlanHash = existing.plan.authorizedPlanHash;
			}
			timing.mark("session");
			if (deps.config.liveExecution) {
				if (!deps.config.SOLANA_RPC_URL) {
					throw new Error("SOLANA_RPC_BALANCE_UNAVAILABLE");
				}
				const required = parsed.selections.reduce(
					(sum, selection) => sum + BigInt(selection.amountInBaseUnits),
					0n,
				);
				const available = await solanaUsdcBalance(
					deps.fetcher ?? fetch,
					deps.config.SOLANA_RPC_URL,
					response.locals.wallet,
				);
				if (available < required) {
					response.status(422).json({
						error: "INSUFFICIENT_FUNDS",
						message: `Basket requires ${formatUnits(required, SOLANA_USDC_DECIMALS)} USDC, but this wallet has ${formatUnits(available, SOLANA_USDC_DECIMALS)} USDC.`,
					});
					return;
				}
			}
			timing.mark("balance");
			const candidates = candidatesForSession.getCandidatesForDisplay
				? await candidatesForSession.getCandidatesForDisplay(
						parsed.selections.map((selection) => selection.assetId),
					)
				: await candidatesForExactAmounts(
						candidatesForSession,
						response.locals.wallet,
						parsed.selections,
						response.locals.txOrigin,
					);
			try {
				validateExecutionAssets(parsed, candidates);
			} catch (error) {
				if (
					error instanceof PolicyError &&
					error.code === "ASSET_NOT_ELIGIBLE"
				) {
					const assetIds = unavailableExecutionAssetIds(parsed, candidates);
					if (
						!assetIds.length ||
						assetIds.some(
							(assetId) => !hasCanonicalExecutionAssetId(parsed.chain, assetId),
						)
					) {
						throw error;
					}
					response.status(422).json({
						error: "EXECUTION_ASSETS_UNAVAILABLE",
						message:
							"One or more selected assets do not have a fresh execution route.",
						provider: session.executionProvider,
						assetIds,
					});
					return;
				}
				throw error;
			}
			timing.mark("candidates");
			const preparation = await executionForSession.prepareBasket(
				response.locals.wallet,
				parsed,
				candidates,
				response.locals.txOrigin,
			);
			if (preparation.unavailableAssetIds?.length) {
				const unavailable = new Set(preparation.unavailableAssetIds);
				const symbols = candidates
					.filter((candidate) => unavailable.has(candidate.assetId))
					.map((candidate) => candidate.symbol);
				response.status(422).json({
					error: "EXECUTION_ASSETS_UNAVAILABLE",
					message: `${symbols.join(", ")} ${symbols.length === 1 ? "is" : "are"} not currently supported by ${providerLabel(session.executionProvider)}.`,
					provider: session.executionProvider,
					assetIds: preparation.unavailableAssetIds,
					symbols,
				});
				return;
			}
			const quotes = preparation.quotes;
			const quotesByAssetId = new Map(
				quotes.map((quote) => [quote.assetId, quote]),
			);
			const quotedCandidates = candidates.map((candidate) => {
				const quote = quotesByAssetId.get(candidate.assetId);
				if (!quote) {
					throw new PolicyError(
						"ASSET_NOT_ELIGIBLE",
						`${candidate.assetId} did not return an executable quote.`,
					);
				}
				return { ...candidate, quote };
			});
			validateExecutionSelection(parsed, quotedCandidates);
			await persistPortfolioMetadata(deps.store, quotedCandidates).catch(
				() => undefined,
			);
			timing.mark("execution");
			const plan = {
				executionPlanVersion: 2,
				executionId: session.executionId ?? randomUUID(),
				sessionId: session.id,
				epochId: session.epochId,
				provider: session.executionProvider,
				chain: parsed.chain,
				cluster: parsed.cluster,
				inputToken: parsed.inputToken,
				signingWallet: session.wallet,
				totalInputBaseUnits: parsed.selections
					.reduce(
						(sum, selection) => sum + BigInt(selection.amountInBaseUnits),
						0n,
					)
					.toString(),
				authorizedPlanHash: requestedPlanHash,
				policyHash: policyHash(parsed.selections, parsed.periodLimitUsd),
				callCommitments: [],
				quotes,
				solanaTransaction: preparation.solanaTransaction,
				solanaTransactions: preparation.solanaTransactions,
				generatedAt: new Date().toISOString(),
			};
			const execution = session.executionId
				? await deps.store.refreshPreparedExecution(
						session.executionId,
						expectedPlanHash,
						plan,
						budgetForTicket(0.1, parsed.periodLimitUsd).periodBudgetBaseUnits,
					)
				: await deps.store.reserveExecution(
						session.id,
						plan,
						budgetForTicket(0.1, parsed.periodLimitUsd).periodBudgetBaseUnits,
					);
			timing.mark("store");
			timing.apply(response);
			response.json({
				...publicExecution(execution),
				kind: "SOLANA_TRANSACTION",
				solanaTransaction: preparation.solanaTransaction,
				solanaTransactions: preparation.solanaTransactions,
			});
		},
	);

	app.post(
		"/api/executions/:executionId/demo-settle",
		requireWallet,
		async (request, response) => {
			if (!deps.config.demoMode || deps.config.liveExecution) {
				response.status(404).json({ error: "NOT_FOUND" });
				return;
			}
			const execution = await deps.store.getExecution(
				String(request.params.executionId),
			);
			if (!execution) {
				response.status(404).json({ error: "EXECUTION_NOT_FOUND" });
				return;
			}
			const transactionHashes = execution.plan.quotes.map(
				(_quote, index) =>
					`0x${sha256(`${execution.plan.executionId}:${index}`).slice(7)}`,
			);
			const settledOutputs = execution.plan.quotes.map((quote, index) => ({
				assetId: quote.assetId,
				amountOutBaseUnits: quote.estimatedAmountOut,
				transactionHash: transactionHashes[index] ?? "",
				status: "success" as const,
			}));
			response.json(
				publicExecution(
					await deps.store.updateExecution(
						execution.plan.executionId,
						"SETTLED",
						transactionHashes,
						settledOutputs,
					),
				),
			);
		},
	);

	app.post(
		"/api/executions/:executionId/submitted",
		requireWallet,
		async (request, response) => {
			if (!deps.config.liveExecution) {
				response.status(409).json({ error: "USE_DEMO_SETTLE" });
				return;
			}
			if (!deps.config.liveBroadcastEnabled) {
				response.status(503).json({
					error: "LIVE_BROADCAST_DISABLED",
					message: "Live transaction broadcasting is temporarily disabled.",
				});
				return;
			}
			const execution = await deps.store.getExecution(
				String(request.params.executionId),
			);
			if (!execution) {
				response.status(404).json({ error: "EXECUTION_NOT_FOUND" });
				return;
			}
			const session = await deps.store.getSession(execution.plan.sessionId);
			if (
				!session ||
				session.wallet !== response.locals.wallet ||
				session.chain !== response.locals.chain
			) {
				response.status(404).json({ error: "EXECUTION_NOT_FOUND" });
				return;
			}
			await assertCanonicalOwner(response, session);
			if (session.executionProvider !== execution.plan.provider) {
				throw new Error("EXECUTION_PROVIDER_MISMATCH");
			}
			if (execution.plan.chain === "SOLANA") {
				const provider = executionProvider(deps, execution.plan.provider);
				if (execution.status !== "PREPARED") {
					if (execution.status === "SUBMITTED") {
						response.json(publicExecution(execution));
						return;
					}
					response.status(409).json({ error: "EXECUTION_NOT_PREPARED" });
					return;
				}
				if (execution.plan.executionPlanVersion !== 2) {
					response.status(409).json({
						error: "EXECUTION_PLAN_OUTDATED",
						message: "Refresh quotes before signing this basket.",
					});
					return;
				}
				assertPlanQuotesFresh(execution.plan);
				const preparedTransactions =
					execution.plan.solanaTransactions ??
					(execution.plan.solanaTransaction
						? [execution.plan.solanaTransaction]
						: []);
				const submitSignedTransaction = provider.submitSignedTransaction;
				const signedTransactionSignature = provider.signedTransactionSignature;
				const signedTransactions = z
					.array(z.string().min(1))
					.parse(
						request.body?.signedTransactions ??
							(request.body?.signedTransaction
								? [request.body.signedTransaction]
								: undefined),
					);
				if (
					!preparedTransactions.length ||
					!submitSignedTransaction ||
					!signedTransactionSignature
				) {
					throw new Error("SOLANA_TRANSACTION_MISSING");
				}
				if (signedTransactions.length !== preparedTransactions.length) {
					response
						.status(422)
						.json({ error: "INVALID_SOLANA_TRANSACTION_COUNT" });
					return;
				}
				const broadcast = await broadcastPreparedExecution({
					execution,
					signedTransactions,
					provider,
					store: deps.store,
				});
				const current = broadcast.execution;
				const hasUnknownBroadcast = broadcast.hasUnknownBroadcast;
				response.status(hasUnknownBroadcast ? 202 : 200).json({
					...publicExecution(current),
					...(hasUnknownBroadcast
						? { reconciliation: ["broadcast-unknown"] }
						: {}),
				});
				return;
			}
		},
	);

	app.post(
		"/api/executions/:executionId/reconcile",
		requireWallet,
		async (request, response) => {
			if (!deps.config.liveExecution) {
				response.status(409).json({ error: "USE_DEMO_SETTLE" });
				return;
			}
			const execution = await deps.store.getExecution(
				String(request.params.executionId),
			);
			if (
				!execution ||
				!["SUBMITTED", "PARTIAL", "FAILED"].includes(execution.status)
			) {
				response.status(409).json({ error: "EXECUTION_NOT_SUBMITTED" });
				return;
			}
			const session = await deps.store.getSession(execution.plan.sessionId);
			if (
				!session ||
				session.wallet !== response.locals.wallet ||
				session.chain !== response.locals.chain
			) {
				response.status(404).json({ error: "EXECUTION_NOT_FOUND" });
				return;
			}
			await assertCanonicalOwner(response, session);
			if (session.executionProvider !== execution.plan.provider) {
				throw new Error("EXECUTION_PROVIDER_MISMATCH");
			}
			if (execution.plan.chain === "SOLANA") {
				const provider = executionProvider(deps, execution.plan.provider);
				const { execution: updated, pending } = await reconcileExecution({
					execution,
					session,
					provider,
					store: deps.store,
				});
				response.status(pending ? 202 : 200).json({
					...publicExecution(updated),
					...(pending ? { reconciliation: ["pending"] } : {}),
				});
				return;
			}
		},
	);

	app.get(
		"/api/executions/:executionId",
		requireWallet,
		async (request, response) => {
			const execution = await deps.store.getExecution(
				String(request.params.executionId),
			);
			if (!execution) {
				response.status(404).json({ error: "EXECUTION_NOT_FOUND" });
				return;
			}
			const session = await deps.store.getSession(execution.plan.sessionId);
			if (
				!session ||
				session.wallet !== response.locals.wallet ||
				session.chain !== response.locals.chain
			) {
				response.status(404).json({ error: "EXECUTION_NOT_FOUND" });
				return;
			}
			await assertCanonicalOwner(response, session);
			response.json(publicExecution(execution));
		},
	);

	if (deps.config.NODE_ENV === "production") {
		const clientPath = path.resolve("dist/client");
		app.use(
			"/assets",
			express.static(path.join(clientPath, "assets"), {
				immutable: true,
				maxAge: "1y",
			}),
		);
		app.use(express.static(clientPath, { maxAge: 0 }));
		app.get("*splat", (_request, response) =>
			response.sendFile(path.join(clientPath, "index.html")),
		);
	}

	app.use(
		(
			error: unknown,
			request: Request,
			response: Response,
			_next: NextFunction,
		) => {
			if (error instanceof ZodError) {
				response.status(422).json({
					error: "INVALID_REQUEST",
					message:
						"Choose at least one eligible asset and check the basket details before continuing.",
				});
				return;
			}
			if (error instanceof ExecutionProviderError) {
				response.status(422).json({
					error: error.code,
					message: publicProviderError(error),
					provider: error.provider,
				});
				return;
			}
			if (error instanceof PolicyError) {
				response
					.status(422)
					.json({ error: error.code, message: error.message });
				return;
			}
			if (error instanceof LivePurchaseSafetyError) {
				response
					.status(error.code === "EXECUTION_NOT_FOUND" ? 404 : 409)
					.json({ error: error.code, message: error.message });
				return;
			}
			if (
				error instanceof Error &&
				error.message === "PERIOD_BUDGET_EXCEEDED"
			) {
				response.status(422).json({
					error: "PERIOD_BUDGET_EXCEEDED",
					message:
						"This basket would exceed your weekly investment limit. Reduce the basket or wait for the next weekly period.",
				});
				return;
			}
			if (
				error instanceof Error &&
				(error.message.startsWith("INVALID_EXECUTION_LEG_TRANSITION") ||
					error.message === "EXECUTION_LEG_NOT_FOUND")
			) {
				response.status(409).json({
					error: "EXECUTION_STATE_CHANGED",
					message:
						"This transaction leg changed state. Refresh the receipt before trying again.",
				});
				return;
			}
			console.error(
				JSON.stringify({
					event: "request_failed",
					method: request.method,
					path: request.path,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			response.status(500).json({
				error: "REQUEST_FAILED",
				message: "The request could not be completed. Please try again.",
			});
		},
	);
	return app;
}

async function solanaUsdPrice(
	fetcher: typeof fetch,
	coingeckoApiKey?: string,
	jupiterApiKey?: string,
) {
	try {
		const endpoint =
			"https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd";
		let coingecko = await fetcher(endpoint, {
			headers: coingeckoApiKey
				? { "x-cg-demo-api-key": coingeckoApiKey }
				: undefined,
			signal: AbortSignal.timeout(5_000),
		});
		if (!coingecko.ok && coingeckoApiKey) {
			coingecko = await fetcher(endpoint, {
				signal: AbortSignal.timeout(5_000),
			});
		}
		if (coingecko.ok) {
			const body = (await coingecko.json()) as { solana?: { usd?: number } };
			const price = body.solana?.usd;
			if (typeof price === "number" && Number.isFinite(price) && price > 0) {
				return price;
			}
		}
	} catch {
		// Jupiter is the live fallback when CoinGecko is unavailable.
	}

	try {
		const jupiter = await fetcher(
			`https://api.jup.ag/price/v3?ids=${encodeURIComponent(SOLANA_NATIVE_MINT)}`,
			{
				headers: jupiterApiKey ? { "x-api-key": jupiterApiKey } : undefined,
				signal: AbortSignal.timeout(5_000),
			},
		);
		if (!jupiter.ok) return undefined;
		const body = (await jupiter.json()) as Record<
			string,
			{ usdPrice?: number }
		>;
		const price = body[SOLANA_NATIVE_MINT]?.usdPrice;
		return typeof price === "number" && Number.isFinite(price) && price > 0
			? price
			: undefined;
	} catch {
		return undefined;
	}
}

function executionProvider(
	deps: AppDependencies,
	id: ExecutionProviderId,
): ExecutionProvider {
	const registry = deps.solanaExecutionProviders;
	const provider = registry ? registry[id] : deps.execution;
	if (!provider) {
		throw new ExecutionProviderError(
			id,
			"PROVIDER_UNAVAILABLE",
			`${id}_PROVIDER_UNAVAILABLE`,
		);
	}
	return provider;
}

function hasBearerSecret(authorization: string | undefined, expected: string) {
	const prefix = "Bearer ";
	if (!authorization?.startsWith(prefix)) return false;
	const provided = Buffer.from(authorization.slice(prefix.length));
	const secret = Buffer.from(expected);
	return provided.length === secret.length && timingSafeEqual(provided, secret);
}

async function resolveAsset(deps: AppDependencies, assetId: string) {
	const registered = solanaAssetById(assetId);
	if (registered) return registered;
	const providers = new Set<CandidateProvider>([
		deps.candidates,
		...Object.values(deps.solanaCandidateProviders ?? {}).filter(
			(provider): provider is CandidateProvider => Boolean(provider),
		),
	]);
	for (const provider of providers) {
		try {
			const asset = await provider.getAsset?.(assetId);
			if (asset) return asset;
		} catch {
			// Continue across provider registries; history is optional enrichment.
		}
	}
	return undefined;
}

function candidateProvider(
	deps: AppDependencies,
	id: ExecutionProviderId,
): CandidateProvider {
	const registry = deps.solanaCandidateProviders;
	const provider = registry ? registry[id] : deps.candidates;
	if (!provider) {
		throw new ExecutionProviderError(
			id,
			"PROVIDER_UNAVAILABLE",
			`${id}_PROVIDER_UNAVAILABLE`,
		);
	}
	return provider;
}

async function rankFeed(
	deps: AppDependencies,
	requestedProvider: FeedRankingProviderId,
	input: RankingInput,
) {
	const registry = deps.rankingProviders;
	const deterministic = registry?.DETERMINISTIC;
	const requested =
		requestedProvider === "DETERMINISTIC"
			? (deterministic ?? deps.inference)
			: registry
				? registry.ZERO_G
				: deps.inference;
	const fallbackWarning =
		"0G private AI ranking was unavailable. Deterministic ranking was used.";

	if (requested) {
		try {
			const generated = await requested.rank(input);
			const effectiveProvider =
				requestedProvider === "ZERO_G" && registry && !registry.ZERO_G
					? "DETERMINISTIC"
					: requestedProvider;
			const warnings =
				effectiveProvider === "DETERMINISTIC" && requestedProvider === "ZERO_G"
					? [...generated.output.warnings, fallbackWarning]
					: generated.output.warnings;
			return {
				output: { ...generated.output, warnings },
				receipt: {
					...generated.receipt,
					requestedProvider,
					effectiveProvider,
					warnings,
				},
			};
		} catch (error) {
			if (requestedProvider !== "ZERO_G" || !deterministic) throw error;
		}
	}

	if (!deterministic) {
		throw new Error(`${requestedProvider}_RANKING_PROVIDER_UNAVAILABLE`);
	}
	const generated = await deterministic.rank(input);
	const warnings =
		requestedProvider === "ZERO_G"
			? [...generated.output.warnings, fallbackWarning]
			: generated.output.warnings;
	return {
		output: { ...generated.output, warnings },
		receipt: {
			...generated.receipt,
			requestedProvider,
			effectiveProvider: "DETERMINISTIC" as const,
			warnings,
		},
	};
}

function providerConfigured(config: AppConfig, id: ExecutionProviderId) {
	if (!config.liveExecution) {
		return id === "JUPITER";
	}
	if (id === "JUPITER") {
		return Boolean(
			config.JUPITER_API_KEY && config.SOLANA_RPC_URL && config.SOLANA_WS_URL,
		);
	}
	return false;
}

async function solanaRpc<T>(
	fetcher: typeof fetch,
	rpcUrl: string,
	request: { id: number; method: string; params: unknown[] },
) {
	const response = await fetcher(rpcUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ jsonrpc: "2.0", ...request }),
	});
	if (!response.ok) throw new Error("SOLANA_RPC_BALANCE_UNAVAILABLE");
	const payload = (await response.json()) as {
		result?: T;
		error?: { message?: string };
	};
	if (!payload.result || payload.error) {
		throw new Error("SOLANA_RPC_BALANCE_UNAVAILABLE");
	}
	return payload.result;
}

async function solanaUsdcBalance(
	fetcher: typeof fetch,
	rpcUrl: string,
	address: string,
) {
	const tokenAccounts = await solanaRpc<{
		value?: Array<{
			account?: {
				data?: {
					parsed?: { info?: { tokenAmount?: { amount?: string } } };
				};
			};
		}>;
	}>(fetcher, rpcUrl, {
		id: 2,
		method: "getTokenAccountsByOwner",
		params: [
			address,
			{ mint: SOLANA_USDC_MINT },
			{ encoding: "jsonParsed", commitment: "confirmed" },
		],
	});
	return (tokenAccounts.value ?? []).reduce(
		(sum, account) =>
			sum +
			BigInt(account.account?.data?.parsed?.info?.tokenAmount?.amount ?? "0"),
		0n,
	);
}

function providerLabel(id: ExecutionProviderId) {
	return id === "JUPITER" ? "Jupiter" : id;
}

function assetExplorerUrl(assetId: string, address: string) {
	if (!assetId.startsWith("sol:")) return undefined;
	return `https://explorer.solana.com/address/${encodeURIComponent(address)}`;
}

function publicProviderError(error: ExecutionProviderError) {
	if (error.code === "PROVIDER_UNAVAILABLE") {
		return error.message === `${error.provider}_PROVIDER_UNAVAILABLE`
			? `${providerLabel(error.provider)} is not configured.`
			: `${providerLabel(error.provider)} is temporarily unavailable.`;
	}
	if (error.code === "TOKEN_UNAUTHORIZED") {
		return `This token is not currently supported by ${providerLabel(error.provider)}.`;
	}
	if (error.code === "INSUFFICIENT_LIQUIDITY") {
		return `No ${providerLabel(error.provider)} route is available at this amount.`;
	}
	if (error.code === "UNSUPPORTED_CHAIN") {
		return `${providerLabel(error.provider)} does not support the selected chain.`;
	}
	if (error.code === "BASKET_TOO_LARGE") return error.message;
	if (error.code === "INSUFFICIENT_FUNDS") return error.message;
	if (error.code === "SIMULATION_FAILED") {
		return "The complete Solana basket did not simulate successfully.";
	}
	if (error.code === "INVALID_TRANSACTION") return error.message;
	return `This token is not valid for ${providerLabel(error.provider)}.`;
}

function demoHistory(symbol: string, period: HistoryPeriod): PricePoint[] {
	const seed = [...symbol].reduce(
		(value, character) => value + character.charCodeAt(0),
		0,
	);
	const now = Math.floor(Date.now() / 1000);
	const spanSeconds = {
		"1H": 3_600,
		"1D": 86_400,
		"1W": 7 * 86_400,
		"1M": 30 * 86_400,
		"3M": 90 * 86_400,
		"1Y": 365 * 86_400,
		ALL: 3 * 365 * 86_400,
	}[period];
	return Array.from({ length: 31 }, (_, index) => {
		const drift = index * ((seed % 7) - 2) * 0.0018;
		const wave = Math.sin(index * 0.7 + seed) * 0.018;
		return {
			timestamp: now - ((30 - index) * spanSeconds) / 30,
			price: 100 * (1 + drift + wave),
		};
	});
}

function serverTiming(route: "feed" | "prepare", log: boolean) {
	const startedAt = performance.now();
	let stageStartedAt = startedAt;
	const stages: Array<{ name: string; duration: number }> = [];
	return {
		mark(name: string) {
			const now = performance.now();
			stages.push({ name, duration: now - stageStartedAt });
			stageStartedAt = now;
		},
		apply(response: Response) {
			const total = performance.now() - startedAt;
			if (log) {
				console.log(
					JSON.stringify({
						event: "request_timing",
						route,
						stages: Object.fromEntries(
							stages.map((stage) => [
								stage.name,
								Number(stage.duration.toFixed(1)),
							]),
						),
						totalMs: Number(total.toFixed(1)),
					}),
				);
			}
			response.setHeader(
				"Server-Timing",
				[
					...stages.map(
						(stage) => `${stage.name};dur=${stage.duration.toFixed(1)}`,
					),
					`total;dur=${total.toFixed(1)}`,
				].join(", "),
			);
		},
	};
}

type AlchemyPortfolioToken = {
	tokenAddress?: string | null;
	tokenBalance?: string;
	tokenMetadata?: {
		decimals?: number | null;
		logo?: string | null;
		name?: string | null;
		symbol?: string | null;
	};
	tokenPrices?: Array<{
		currency: string;
		value: string;
		lastUpdatedAt?: string;
	}>;
};

type AlchemyPortfolioResponse = {
	data?: { tokens?: AlchemyPortfolioToken[]; pageKey?: string | null };
};

function alchemyPortfolioEndpoint(rpcUrl?: string) {
	if (!rpcUrl) return undefined;
	try {
		const parsed = new URL(rpcUrl);
		if (!parsed.hostname.endsWith("alchemy.com")) return undefined;
		const apiKey = parsed.pathname.split("/").filter(Boolean).at(-1);
		return apiKey
			? `https://api.g.alchemy.com/data/v1/${apiKey}/assets/tokens/balances/by-address`
			: undefined;
	} catch {
		return undefined;
	}
}

function hexBalanceToDecimal(value?: string) {
	if (!value) return "0";
	try {
		return BigInt(value).toString();
	} catch {
		return "0";
	}
}
