import { usePrivy } from "@privy-io/react-auth";
import {
	type ConnectedStandardSolanaWallet,
	useWallets as useSolanaWallets,
} from "@privy-io/react-auth/solana";
import {
	ArrowLeft,
	BaggageClaim,
	Bot,
	ChevronLeft,
	ChevronRight,
	ArrowRight as LucideArrowRight,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deterministicShuffle } from "../domain/deterministic-shuffle";
import {
	fillFeedPage,
	nextFeedExcludedAssetIds,
	shouldPrefetchNextFeed,
} from "../domain/feed-pagination";
import {
	type Candidate,
	formatTicketSizeUsd,
	type OnboardingPreferences,
} from "../domain/schemas";
import {
	ApiError,
	api,
	configureApiAuth,
	type ExecutionRecord,
	type FeedResponse,
	type PublicConfig,
	type WeeklySession,
} from "./api";
import { feedBasketSelections } from "./basket-selections";
import { AccountScreen } from "./components/AccountScreen";
import { AppShell } from "./components/AppShell";
import { AssetIconProvider } from "./components/AssetMark";
import { BudgetRail } from "./components/BudgetRail";
import { FeedCardSkeleton } from "./components/FeedCardSkeleton";
import { Confetti } from "./components/magicui/confetti";
import { Onboarding } from "./components/Onboarding";
import { PositionsScreen } from "./components/PositionsScreen";
import { ReceiptScreen } from "./components/ReceiptScreen";
import { ReviewScreen } from "./components/ReviewScreen";
import { SwipeCard } from "./components/SwipeCard";
import {
	removeLegacyPreferences,
	writeAccountPreferences,
} from "./preferences-storage";
import {
	findEmbeddedSolanaWallet,
	findExternalSolanaWallet,
} from "./solana-wallet-selection";
import {
	readThemeSettings,
	type AppTheme,
	writeThemeSettings,
} from "./theme-settings";
import {
	pathForPrimaryView,
	primaryViewFromPathname,
	type PrimaryView,
} from "./view-routing";

type View = PrimaryView | "receipts";
type Stage = "loading" | "onboarding" | "swipe" | "review";
type DecisionFeedback = "invest" | "skip";
const LAST_EXECUTION_KEY = "investmade:last-execution";
const LAST_EXECUTION_CANDIDATES_KEY = "investmade:last-execution-candidates";
const FEED_RETRY_DELAY_MS = 900;

function shuffledFeedPage(
	candidates: Candidate[],
	session: WeeklySession,
	page: number,
) {
	return deterministicShuffle(
		fillFeedPage(
			[...candidates].sort((left, right) =>
				left.assetId < right.assetId
					? -1
					: left.assetId > right.assetId
						? 1
						: 0,
			),
		),
		`${session.wallet}:${session.chain}:feed:${page}`,
	);
}

function rememberWarnings(
	target: Map<string, string[]>,
	response: FeedResponse,
) {
	for (const candidate of response.candidates) {
		target.set(candidate.assetId, response.feed.warnings);
	}
}

function shouldRetryFeed(error: unknown) {
	return !(
		error instanceof ApiError &&
		[
			"AUTH_REQUIRED",
			"EXECUTION_PROVIDER_CHANGED",
			"INVALID_REQUEST",
			"SESSION_NOT_FOUND",
		].includes(error.code)
	);
}

async function generateFeedWithRetry(
	sessionId: string,
	preferences: OnboardingPreferences,
) {
	try {
		return await api.generateFeed(sessionId, preferences);
	} catch (error) {
		if (!shouldRetryFeed(error)) throw error;
		await new Promise((resolve) =>
			window.setTimeout(resolve, FEED_RETRY_DELAY_MS),
		);
		return api.generateFeed(sessionId, preferences);
	}
}

export function App({ config }: { config: PublicConfig }) {
	const {
		authenticated,
		getAccessToken,
		linkWallet,
		login,
		ready: privyReady,
		user,
	} = usePrivy();
	const { ready: solanaWalletsReady, wallets: solanaWallets } = useSolanaWallets();
	const [view, setView] = useState<View>(
		() => primaryViewFromPathname(window.location.pathname) ?? "week",
	);
	const [stage, setStage] = useState<Stage>("onboarding");
	const [onboardingChain, setOnboardingChain] = useState<"SOLANA">("SOLANA");
	const [session, setSession] = useState<WeeklySession>();
	const [feed, setFeed] = useState<FeedResponse>();
	const [preferences, setPreferences] = useState<OnboardingPreferences>();
	const [themeSettings, setThemeSettings] = useState(readThemeSettings);
	const [index, setIndex] = useState(0);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [feedTicketSizeUsd, setFeedTicketSizeUsd] = useState<number>();
	const [assetInfoOpen, setAssetInfoOpen] = useState(false);
	const [settlement, setSettlement] = useState<ExecutionRecord>();
	const [receiptCandidates, setReceiptCandidates] = useState<Candidate[]>([]);
	const [error, setError] = useState("");
	const [decisionFeedback, setDecisionFeedback] = useState<DecisionFeedback>();
	const [loadingMore, setLoadingMore] = useState(false);
	const [feedExhausted, setFeedExhausted] = useState(false);
	const decisionTimer = useRef<number | undefined>(undefined);
	const prefetchedFeed = useRef<
		| {
				key: string;
				result: Promise<FeedResponse | undefined>;
		  }
		| undefined
	>(undefined);
	const warningsByAssetId = useRef(new Map<string, string[]>());
	const activeChain = preferences?.activeChain ?? "SOLANA";
	const shellChain = stage === "onboarding" ? onboardingChain : activeChain;
	const activeTheme = themeSettings[shellChain];
	const saveTheme = useCallback(
		(theme: AppTheme) => {
			setThemeSettings((current) => {
				const next = { ...current, [activeChain]: theme };
				writeThemeSettings(next);
				return next;
			});
		},
		[activeChain],
	);
	const selectedSolanaWallet = findEmbeddedSolanaWallet(
		solanaWallets,
		user?.linkedAccounts,
	);
	const externalSolanaWallet = findExternalSolanaWallet(
		solanaWallets,
		selectedSolanaWallet,
	);
	const wallet = selectedSolanaWallet?.address ?? "";
	const fundingWalletAddress = externalSolanaWallet?.address ?? "";
	const displayWallet = wallet;
	const walletConnectionRequired = !authenticated || !selectedSolanaWallet;
	const connectWallet = useCallback(() => {
		if (!privyReady) return;
		if (!authenticated) {
			login({
				loginMethods: ["wallet", "email"],
				walletChainType: "solana-only",
			});
			return;
		}
		linkWallet({
			walletChainType: "solana-only",
			description: "Connect the wallet that will approve your baskets.",
		});
	}, [authenticated, linkWallet, login, privyReady]);

	useEffect(() => {
		configureApiAuth({
			getAccessToken,
			getWalletAddress: () => wallet || undefined,
			getTxOriginAddress: () => selectedSolanaWallet?.address,
			getWalletChain: () => "SOLANA",
		});
		return () => configureApiAuth(undefined);
	}, [
		getAccessToken,
		selectedSolanaWallet?.address,
		wallet,
	]);

	useEffect(() => {
		removeLegacyPreferences();
	}, []);

	useEffect(() => {
		const initialView =
			primaryViewFromPathname(window.location.pathname) ?? "week";
		const canonicalPath = pathForPrimaryView(initialView);
		if (
			window.location.pathname !== "/" &&
			window.location.pathname !== canonicalPath
		) {
			window.history.replaceState(
				window.history.state,
				"",
				`${canonicalPath}${window.location.search}${window.location.hash}`,
			);
		}

		const handlePopState = () => {
			const target = primaryViewFromPathname(window.location.pathname);
			if (!target) return;
			scrollToTop();
			setView(target);
			setStage((current) => (current === "onboarding" ? current : "swipe"));
		};

		window.addEventListener("popstate", handlePopState);
		return () => window.removeEventListener("popstate", handlePopState);
	}, []);

	useEffect(() => {
		if (!wallet) return;
		const executionId = localStorage.getItem(lastExecutionKey(wallet));
		if (!executionId) return;
		setReceiptCandidates(readReceiptCandidates(wallet));
		let cancelled = false;
		api
			.execution(executionId)
			.then(async (record) => {
				if (cancelled) return;
				setSettlement(record);
				if (record.status !== "SUBMITTED") return;
				const reconciled = await api.reconcile(executionId);
				if (!cancelled) setSettlement(reconciled);
			})
			.catch(() => {
				localStorage.removeItem(lastExecutionKey(wallet));
			});
		return () => {
			cancelled = true;
		};
	}, [wallet]);

	const loadSession = useCallback(
		async (preferences: OnboardingPreferences) => {
			const sessionSolanaWallet = selectedSolanaWallet;
			const sessionWallet = sessionSolanaWallet?.address;
			configureApiAuth({
				getAccessToken,
				getWalletAddress: () => sessionWallet,
				getTxOriginAddress: () => sessionSolanaWallet?.address,
				getWalletChain: () => "SOLANA",
			});
			const prefetch = prefetchedFeed.current;
			const minimumLoader = new Promise((resolve) =>
				window.setTimeout(resolve, 1000),
			);
			setError("");
			setView(primaryViewFromPathname(window.location.pathname) ?? "week");
			setStage("loading");
			setPreferences(preferences);
			setSession(undefined);
			setFeed(undefined);
			setIndex(0);
			setSelectedIds([]);
			setFeedTicketSizeUsd(undefined);
			setFeedExhausted(false);
			try {
				if (authenticated) await api.savePreferences(preferences);
				const [opened, prefetched] = await Promise.all([
					api.openSession(
						preferences.cadence,
						preferences.executionProvider,
						preferences.activeChain,
						preferences.feedRankingProvider,
					),
					prefetch?.key === JSON.stringify(preferences)
						? prefetch.result
						: undefined,
				]);
				const generated =
					prefetched ?? (await generateFeedWithRetry(opened.id, preferences));
				await minimumLoader;
				prefetchedFeed.current = undefined;
				rememberWarnings(warningsByAssetId.current, generated);
				setSession(opened);
				setFeed({
					...generated,
					candidates: shuffledFeedPage(generated.candidates, opened, 0),
				});
				setIndex(0);
				setSelectedIds([]);
				setFeedExhausted(false);
				if (window.location.pathname === "/") {
					window.history.replaceState(
						window.history.state,
						"",
						`${pathForPrimaryView("week")}${window.location.search}${window.location.hash}`,
					);
				}
				scrollToTop();
				setStage("swipe");
			} catch (caught) {
				await minimumLoader;
				setError(
					caught instanceof Error ? caught.message : "Could not open session",
				);
				scrollToTop();
				setStage("swipe");
			}
		},
		[
			authenticated,
			getAccessToken,
			selectedSolanaWallet,
		],
	);

	const prefetchFeed = useCallback((preferences: OnboardingPreferences) => {
		const key = JSON.stringify(preferences);
		if (prefetchedFeed.current?.key === key) return;
		prefetchedFeed.current = {
			key,
			result: api
				.openSession(
					preferences.cadence,
					preferences.executionProvider,
					preferences.activeChain,
					preferences.feedRankingProvider,
				)
				.then((opened) => api.generateFeed(opened.id, preferences))
				.catch(() => undefined),
		};
	}, []);

	useEffect(() => {
		if (authenticated && user?.id && preferences) {
			writeAccountPreferences(user.id, preferences);
		}
	}, [authenticated, preferences, user?.id]);

	useEffect(() => {
		if (!privyReady || authenticated) return;
		setView(primaryViewFromPathname(window.location.pathname) ?? "week");
		setStage("onboarding");
		setSession(undefined);
		setFeed(undefined);
		warningsByAssetId.current.clear();
		setPreferences(undefined);
		setIndex(0);
		setSelectedIds([]);
		setFeedTicketSizeUsd(undefined);
		setSettlement(undefined);
		setReceiptCandidates([]);
		setError("");
		setDecisionFeedback(undefined);
		setFeedExhausted(false);
	}, [authenticated, privyReady]);

	useEffect(
		() => () => {
			if (decisionTimer.current) window.clearTimeout(decisionTimer.current);
		},
		[],
	);

	const candidates = feed?.candidates ?? [];
	const current = candidates[index];
	const currentFeedCard = current
		? feed?.feed.cards.find((card) => card.assetId === current.assetId)
		: undefined;
	const currentWarnings = current
		? (warningsByAssetId.current.get(current.assetId) ??
			feed?.feed.warnings ??
			[])
		: [];
	const nextAssetId = candidates[index + 1]?.assetId;
	const selected = selectedIds
		.map((assetId) =>
			candidates.find((candidate) => candidate.assetId === assetId),
		)
		.filter((candidate): candidate is Candidate => Boolean(candidate));
	const ticketSizeUsd =
		feedTicketSizeUsd ?? preferences?.ticketSizeUsd ?? 10;
	const periodLimitUsd = preferences?.periodLimitUsd ?? 100;
	const feedBasketTotalUsd = selected.length * ticketSizeUsd;
	const feedExecutionSelections = useMemo(
		() => feedBasketSelections(selected, ticketSizeUsd),
		[selected, ticketSizeUsd],
	);
	const executionSelections = feedExecutionSelections;
	const reviewCandidates = executionSelections.map(
		({ candidate }) => candidate,
	);
	const stableToken = "USDC";
	const canAddCurrent = feedBasketTotalUsd + ticketSizeUsd <= periodLimitUsd;
	const addCurrentLabel = canAddCurrent
		? `Add ${ticketSizeUsd} ${stableToken}`
		: "Low balance";

	useEffect(() => {
		if (!nextAssetId) return;
		void Promise.all([
			api.assetHistory(nextAssetId, "ALL"),
			api.assetHistory(nextAssetId, "1M"),
		]).catch(() => undefined);
	}, [nextAssetId]);

	const recoverReviewSession = useCallback(async () => {
		if (!preferences) throw new Error("PREFERENCES_REQUIRED");
		const opened = await api.openSession(
			preferences.cadence,
			preferences.executionProvider,
			preferences.activeChain,
			preferences.feedRankingProvider,
		);
		const generated = await api.generateFeed(opened.id, preferences);
		const assetIds = executionSelections.map(
			(selection) => selection.candidate.assetId,
		);
		if (!assetIds.length)
			throw new Error("NO_ELIGIBLE_CANDIDATES_FOR_PREFERENCES");
		setSession(opened);
		rememberWarnings(warningsByAssetId.current, generated);
		setFeed({
			...generated,
			candidates: shuffledFeedPage(generated.candidates, opened, 0),
		});
		return { sessionId: opened.id, assetIds };
	}, [executionSelections, preferences]);

	const loadMoreCandidates = useCallback(async () => {
		if (!feed || !preferences || !session || loadingMore || feedExhausted)
			return;
		setLoadingMore(true);
		try {
			const next = await api.generateFeed(
				session.id,
				preferences,
				nextFeedExcludedAssetIds(feed),
			);
			rememberWarnings(warningsByAssetId.current, next);
			const nextCandidates = shuffledFeedPage(
				next.candidates,
				session,
				feed.candidates.length,
			);
			setFeed((currentFeed) => {
				if (!currentFeed) return next;
				const rankOffset = currentFeed.feed.cards.length;
				return {
					...next,
					candidates: [...currentFeed.candidates, ...nextCandidates],
					feed: {
						...next.feed,
						cards: [
							...currentFeed.feed.cards,
							...next.feed.cards.map((card, cardIndex) => ({
								...card,
								rank: rankOffset + cardIndex + 1,
							})),
						],
					},
				};
			});
		} catch (caught) {
			if (
				caught instanceof ApiError &&
				caught.code !== "NO_ELIGIBLE_CANDIDATES_FOR_PREFERENCES"
			) {
				console.error("Could not load the next feed page", caught);
			}
			setFeedExhausted(true);
		} finally {
			setLoadingMore(false);
		}
	}, [feed, feedExhausted, loadingMore, preferences, session]);

	useEffect(() => {
		if (
			!feed?.hasMore ||
			feedExhausted ||
			loadingMore ||
			!shouldPrefetchNextFeed(index, candidates.length)
		) {
			return;
		}
		void loadMoreCandidates();
	}, [
		candidates.length,
		feed,
		feedExhausted,
		index,
		loadMoreCandidates,
		loadingMore,
	]);

	useEffect(() => {
		const nextCandidate = candidates[index + 1];
		if (!nextCandidate) return;
		// One default-range prefetch per visible card stays within CoinGecko Demo limits.
		void api.assetHistory(nextCandidate.assetId, "1M").catch(() => undefined);
	}, [candidates, index]);

	function decide(add: boolean) {
		if (!current) return;
		if (add && !selectedIds.includes(current.assetId) && canAddCurrent) {
			setSelectedIds((ids) => [...ids, current.assetId]);
		}
		setIndex((value) => Math.min(value + 1, candidates.length));
	}

	function animateDecision(add: boolean) {
		if (!current || decisionFeedback || (add && !canAddCurrent)) return;
		setDecisionFeedback(add ? "invest" : "skip");
		decisionTimer.current = window.setTimeout(() => {
			decide(add);
			setDecisionFeedback(undefined);
			decisionTimer.current = undefined;
		}, 300);
	}

	function removeFeedAsset(assetId: string) {
		setSelectedIds((ids) => ids.filter((id) => id !== assetId));
		setFeedExhausted(false);
	}


	function navigate(target: View) {
		scrollToTop();
		setView(target);
		if (target !== "receipts") {
			const targetPath = pathForPrimaryView(target);
			if (window.location.pathname !== targetPath) {
				window.history.pushState(
					window.history.state,
					"",
					`${targetPath}${window.location.search}${window.location.hash}`,
				);
			}
		}
		if (!authenticated || stage === "onboarding") return;
		if (
			stage === "review" ||
			(target === "week" && stage === "loading" && feed)
		) {
			setStage("swipe");
		}
	}

	const applyWalletPreferences = useCallback(
		async (
			_chain: "SOLANA",
			solanaWallet?: ConnectedStandardSolanaWallet,
		) => {
			if (!preferences) return;
			if (!solanaWallet) {
				setError("Connect or create a Solana wallet with Privy first.");
				return;
			}
			const next: OnboardingPreferences = {
				...preferences,
				activeChain: "SOLANA",
				executionProvider: "JUPITER",
				solanaExecutionProvider: "JUPITER",
				solanaExecutionWallet:
					solanaWallet?.address ?? preferences.solanaExecutionWallet,
			};
			prefetchedFeed.current = undefined;
			setSettlement(undefined);
			setSelectedIds([]);
			setFeed(undefined);
			setPreferences(next);
			const nextWallet = solanaWallet.address;
			configureApiAuth({
				getAccessToken,
				getWalletAddress: () => nextWallet,
				getTxOriginAddress: () => solanaWallet.address,
				getWalletChain: () => "SOLANA",
			});
			await loadSession(next);
		},
		[
			getAccessToken,
			loadSession,
			preferences,
		],
	);

	return (
		<AssetIconProvider>
			<AppShell
				active={stage === "review" ? "week" : view}
				onNavigate={navigate}
				wallet={displayWallet}
				onWallet={connectWallet}
				walletReady={privyReady && (!authenticated || solanaWalletsReady)}
				navigationEnabled
				activeChain={shellChain}
				theme={activeTheme}
				solanaWallets={solanaWallets}
				selectedSolanaWallet={selectedSolanaWallet}
				onSolanaWalletChange={(selected) => {
					void applyWalletPreferences("SOLANA", selected);
				}}
			>
				{walletConnectionRequired ? (
					<main className="swipe-page">
						<section className="swipe-workspace">
							<header className="page-heading">
								<h1>Build your basket</h1>
								<p>Swipe right to add, left to skip.</p>
							</header>
							<div className="fatal-state wallet-required-state">
								<h2>Connect your wallet first</h2>
								<p>
									Connect a wallet before viewing your personalized feed and
									building a basket.
								</p>
								<button
									type="button"
									onClick={connectWallet}
									disabled={
										!privyReady || (authenticated && !solanaWalletsReady)
									}
								>
									{!privyReady || (authenticated && !solanaWalletsReady)
										? "Loading wallet…"
										: "Connect wallet"}
								</button>
							</div>
						</section>
					</main>
				) : stage === "onboarding" ? (
					<Onboarding
						config={config}
						onComplete={loadSession}
						onPrefetch={prefetchFeed}
						privyReady={privyReady}
						onChainPreview={setOnboardingChain}
					/>
				) : view === "receipts" ? (
					<ReceiptScreen
						record={settlement}
						selected={
							receiptCandidates.length ? receiptCandidates : reviewCandidates
						}
						feed={feed}
						demoMode={config.demoMode}
						onResume={async () => {
							if (!settlement) return;
							const reconciled = await api.reconcile(
								settlement.plan.executionId,
							);
							setSettlement(reconciled);
						}}
						onViewPortfolio={() => {
							navigate("positions");
						}}
						onStartNextBasket={() => {
							if (preferences) {
								navigate("week");
								void loadSession(preferences);
							}
						}}
					/>
				) : view === "positions" ? (
					<PositionsScreen
						candidates={Array.from(
							new Map(
								candidates.map((candidate) => [candidate.assetId, candidate]),
							).values(),
						)}
						wallet={wallet}
						demoMode={config.demoMode}
						showBuildBasket={config.executionMode === "local-live"}
						onBuildAnotherBasket={async () => {
							navigate("week");
							if (preferences) await loadSession(preferences);
						}}
					/>
				) : view === "account" && preferences ? (
					<AccountScreen
						wallet={wallet}
						fundingWallet={fundingWalletAddress}
						preferences={preferences}
						theme={themeSettings[activeChain]}
						executionProviders={config.executionProviders}
						feedRankingProviders={config.feedRankingProviders}
						onConnectExternalWallet={() =>
							linkWallet({
								walletChainType: "solana-only",
								description: "Connect a funding wallet.",
							})
						}
						onSave={async (next) => {
							if (user?.id) writeAccountPreferences(user.id, next);
							prefetchedFeed.current = undefined;
							setSettlement(undefined);
							navigate("week");
							await loadSession(next);
						}}
						onSaveTheme={saveTheme}
					/>
				) : stage === "review" && session && feed ? (
					<ReviewScreen
						session={session}
						feed={feed}
						selections={executionSelections}
						onRemove={removeFeedAsset}
						onBack={() => {
							scrollToTop();
							setStage("swipe");
							setView("week");
						}}
						onSettled={(record) => {
							setSettlement(record);
							setReceiptCandidates(
								executionCandidates(
									record,
									reviewCandidates,
									wallet ? readReceiptCandidates(wallet) : [],
								),
							);
							setView("receipts");
						}}
						onSessionExpired={recoverReviewSession}
						onExecutionInvalidated={() => {
							setSettlement(undefined);
							if (wallet) {
								localStorage.removeItem(lastExecutionKey(wallet));
								localStorage.removeItem(lastExecutionCandidatesKey(wallet));
							}
						}}
						onStartAnotherBasket={() => {
							if (preferences) {
								navigate("week");
								void loadSession(preferences);
							}
						}}
						periodLimitUsd={periodLimitUsd}
						wallet={wallet}
						liveExecution={config.executionMode !== "demo"}
						activeChain="SOLANA"
						solanaWallet={selectedSolanaWallet}
						onExecutionChange={(record) => {
							setSettlement(record);
							const snapshot = executionCandidates(
								record,
								reviewCandidates,
								wallet ? readReceiptCandidates(wallet) : [],
							);
							setReceiptCandidates(snapshot);
							if (wallet) {
								localStorage.setItem(
									lastExecutionKey(wallet),
									record.plan.executionId,
								);
								if (snapshot.length === record.plan.quotes.length) {
									localStorage.setItem(
										lastExecutionCandidatesKey(wallet),
										JSON.stringify(snapshot),
									);
								}
							}
						}}
					/>
				) : (
					<main className="swipe-page">
						<section className="swipe-workspace">
							<header className="page-heading">
								<h1>Build your basket</h1>
								<p>Swipe right to add left to skip.</p>
							</header>
							{error ? (
								<div className="fatal-state">
									<h2>Session unavailable</h2>
									<p>{error}</p>
									<button
										type="button"
										onClick={() => {
											if (preferences) void loadSession(preferences);
										}}
										disabled={!preferences}
									>
										Try again
									</button>
								</div>
							) : stage === "loading" || !feed ? (
								<FeedCardSkeleton message="Building your personal feed…" />
							) : current ? (
								<>
									<div className="card-stage">
										<button
											type="button"
											className="gesture gesture-skip"
											onClick={() => animateDecision(false)}
											aria-label="Skip asset"
											disabled={Boolean(decisionFeedback)}
										>
											<ArrowLeft />
											<span>
												Skip<small>Swipe left</small>
											</span>
										</button>
										<SwipeCard
											candidate={current}
											reason={currentFeedCard?.reason ?? current.reason}
											ticketSizeUsd={ticketSizeUsd}
											stableToken={stableToken}
											feedback={decisionFeedback}
											infoOpen={assetInfoOpen}
										onInfoOpenChange={setAssetInfoOpen}
										onTicketSizeChange={setFeedTicketSizeUsd}
										onSwipe={animateDecision}
										/>
										<button
											type="button"
											className="gesture gesture-add"
											onClick={() => animateDecision(true)}
											aria-label={addCurrentLabel}
											disabled={Boolean(decisionFeedback) || !canAddCurrent}
										>
											<LucideArrowRight />
											<span>
												{canAddCurrent ? (
													<>
														Add<small>Swipe right</small>
													</>
												) : (
													"Low balance"
												)}
											</span>
										</button>
									</div>
									{currentWarnings.length ? (
										<aside className="ai-warnings" aria-label="0G warnings">
											<Bot aria-hidden="true" />
											<ul>
												{currentWarnings.map((warning) => (
													<li key={warning}>{warning}</li>
												))}
											</ul>
										</aside>
									) : null}
									<div
										className={`card-actions${selected.length ? " has-selection" : ""}`}
									>
										<button
											type="button"
											className="button button-skip"
											onClick={() => animateDecision(false)}
											disabled={Boolean(decisionFeedback)}
										>
											<ChevronLeft aria-hidden="true" /> Skip
										</button>
										<button
											type="button"
											className="button button-outline"
											onClick={() => {
												scrollToTop();
												setStage("review");
											}}
											disabled={!feedExecutionSelections.length}
										>
											Review basket ({selected.length}) <BaggageClaim />
										</button>
										<button
											type="button"
											className="button button-primary"
											onClick={() => animateDecision(true)}
											disabled={Boolean(decisionFeedback) || !canAddCurrent}
										>
											{addCurrentLabel}{" "}
											<ChevronRight aria-hidden="true" />
										</button>
									</div>
								</>
							) : loadingMore ? (
								<FeedCardSkeleton
									message="Finding more assets…"
									detail="Your selected basket stays ready to review."
								/>
							) : (
								<div className="feed-complete">
									{selected.length ? (
										<Confetti
											className="completion-confetti"
											options={{
												gravity: 0.9,
												particleCount: 120,
												spread: 90,
												startVelocity: 36,
											}}
										/>
									) : null}
									<h2>That’s the feed.</h2>
									<p>
										{selected.length
											? `${formatTicketSizeUsd(feedBasketTotalUsd)} ${stableToken} is ready for review.`
											: config.executionMode === "demo"
												? `You skipped every card. Your ${stableToken} stays in your wallet.`
												: `No more executable routes are available right now. Your ${stableToken} stays in your wallet.`}
									</p>
									<button
										type="button"
										className="button button-primary"
										disabled={!feedExecutionSelections.length}
										onClick={() => {
											scrollToTop();
											setStage("review");
										}}
									>
										Review basket ({selected.length}) <BaggageClaim />
									</button>
								</div>
							)}
						</section>
						<BudgetRail
							selected={selected}
							onRemove={removeFeedAsset}
							ticketSizeUsd={ticketSizeUsd}
							periodLimitUsd={periodLimitUsd}
						/>
					</main>
				)}
			</AppShell>
		</AssetIconProvider>
	);
}

function scrollToTop() {
	window.scrollTo({ top: 0, behavior: "auto" });
}

function lastExecutionKey(wallet: string) {
	return `${LAST_EXECUTION_KEY}:${wallet.toLowerCase()}`;
}

function lastExecutionCandidatesKey(wallet: string) {
	return `${LAST_EXECUTION_CANDIDATES_KEY}:${wallet.toLowerCase()}`;
}

function readReceiptCandidates(wallet: string) {
	try {
		const value = JSON.parse(
			localStorage.getItem(lastExecutionCandidatesKey(wallet)) ?? "[]",
		);
		return Array.isArray(value) ? (value as Candidate[]) : [];
	} catch {
		return [];
	}
}

function executionCandidates(
	record: ExecutionRecord,
	current: Candidate[],
	fallback: Candidate[],
) {
	const quotes = new Map(
		record.plan.quotes.map((quote) => [quote.assetId, quote]),
	);
	const withQuotes = (candidates: Candidate[]) =>
		candidates.flatMap((candidate) => {
			const quote = quotes.get(candidate.assetId);
			return quote ? [{ ...candidate, quote }] : [];
		});
	const selected = withQuotes(current);
	if (selected.length === record.plan.quotes.length) return selected;
	return withQuotes(fallback);
}
