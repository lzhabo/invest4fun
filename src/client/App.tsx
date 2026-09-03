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
import { type BundleBasketItem, bundleExecutionLegs } from "../domain/ideas";
import {
	type Candidate,
	formatTicketSizeUsd,
	type OnboardingPreferences,
} from "../domain/schemas";
import { normalizeWeights } from "../domain/strategies";
import { resolveAccountBootstrap } from "./account-bootstrap";
import {
	ApiError,
	api,
	configureApiAuth,
	type ExecutionRecord,
	type FeedResponse,
	type PublicConfig,
	type WeeklySession,
} from "./api";
import { type AppEntryStage, resolveAppEntryView } from "./app-entry-route";
import { feedBasketSelections } from "./basket-selections";
import { chartPrefetchRequests } from "./chart-loading-policy";
import { AccountScreen } from "./components/AccountScreen";
import { AppShell } from "./components/AppShell";
import { BudgetRail } from "./components/BudgetRail";
import { type BuilderDraft, BuilderScreen } from "./components/BuilderScreen";
import { CommunityIdeasScreen } from "./components/CommunityIdeasScreen";
import { FeedCardSkeleton } from "./components/FeedCardSkeleton";
import { FundingNotifications } from "./components/FundingNotifications";
import { FundingScreen } from "./components/FundingScreen";
import { IdeasScreen } from "./components/IdeasScreen";
import { Confetti } from "./components/magicui/confetti";
import { Onboarding } from "./components/Onboarding";
import { AppBootstrapSkeleton } from "./components/PageSkeletons";
import { PositionsScreen } from "./components/PositionsScreen";
import { ReceiptScreen } from "./components/ReceiptScreen";
import { ReviewScreen } from "./components/ReviewScreen";
import { SwipeCard } from "./components/SwipeCard";
import { mergeRefreshedFeed } from "./feed-refresh";
import { openFeedSession } from "./feed-session";
import { checkFundingWithin } from "./funding-check";
import { stageAfterPrimaryNavigation } from "./funding-navigation";
import { newAccountPreferences } from "./onboarding-defaults";
import {
	readAccountPreferences,
	removeLegacyPreferences,
	writeAccountPreferences,
} from "./preferences-storage";
import {
	findEmbeddedSolanaWallet,
	findExternalSolanaWallet,
} from "./solana-wallet-selection";
import type { AppTheme, ThemeSettings } from "./theme-settings";
import { copyWalletAddress, useWalletFunding } from "./use-wallet-funding";
import {
	isPublicPrimaryView,
	type PrimaryView,
	pathForPrimaryView,
	primaryViewFromPathname,
	shouldShowPublicFeedPreview,
} from "./view-routing";
import { shouldShowFunding } from "./wallet-funding";

type View = PrimaryView | "receipts";
type Stage = AppEntryStage;
type FundingReturn = "open-session" | "swipe" | "review";
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

export function App({
	config,
	themeSettings,
	onThemeSettingsChange,
}: {
	config: PublicConfig;
	themeSettings: ThemeSettings;
	onThemeSettingsChange: (settings: ThemeSettings) => void;
}) {
	const {
		authenticated,
		getAccessToken,
		linkWallet,
		login,
		logout,
		ready: privyReady,
		user,
	} = usePrivy();
	const { ready: solanaWalletsReady, wallets: solanaWallets } =
		useSolanaWallets();
	const [view, setView] = useState<View>(
		() => primaryViewFromPathname(window.location.pathname) ?? "week",
	);
	const [stage, setStage] = useState<Stage>("bootstrapping");
	const [bootstrapIssue, setBootstrapIssue] = useState<
		| {
				state: "reauthenticate" | "unavailable";
				message: string;
				hasCachedPreferences: boolean;
		  }
		| undefined
	>();
	const [session, setSession] = useState<WeeklySession>();
	const [feed, setFeed] = useState<FeedResponse>();
	const [preferences, setPreferences] = useState<OnboardingPreferences>();
	const [index, setIndex] = useState(0);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [retrySelections, setRetrySelections] = useState<
		Array<{ candidate: Candidate; amountInBaseUnits: string }> | undefined
	>();
	const [builderDraft, setBuilderDraft] = useState<BuilderDraft>({
		prompt: "",
		amountCents: 10_000,
	});
	const [builderBasket, setBuilderBasket] = useState<BundleBasketItem>();
	const [ideaBasket, setIdeaBasket] = useState<BundleBasketItem[]>([]);
	const [reviewReturnView, setReviewReturnView] = useState<PrimaryView>("week");
	const [feedTicketSizeUsd, setFeedTicketSizeUsd] = useState<number>();
	const [periodUsedUsd, setPeriodUsedUsd] = useState(0);
	const [assetInfoOpen, setAssetInfoOpen] = useState(false);
	const [settlement, setSettlement] = useState<ExecutionRecord>();
	const [receiptCandidates, setReceiptCandidates] = useState<Candidate[]>([]);
	const [error, setError] = useState("");
	const [decisionFeedback, setDecisionFeedback] = useState<DecisionFeedback>();
	const [loadingMore, setLoadingMore] = useState(false);
	const [loadMoreError, setLoadMoreError] = useState("");
	const [feedExhausted, setFeedExhausted] = useState(false);
	const [feedUpdatedAt, setFeedUpdatedAt] = useState<number>();
	const [feedClock, setFeedClock] = useState(() => Date.now());
	const [refreshingFeed, setRefreshingFeed] = useState(false);
	const [refreshFeedError, setRefreshFeedError] = useState("");
	const [planNotice, setPlanNotice] = useState("");
	const [fundingReturn, setFundingReturn] =
		useState<FundingReturn>("open-session");
	const [fundingActive, setFundingActive] = useState(false);
	const decisionTimer = useRef<number | undefined>(undefined);
	const bootstrapRequestId = useRef(0);
	const lastFundingWallet = useRef("");
	const warningsByAssetId = useRef(new Map<string, string[]>());
	const activeChain = preferences?.activeChain ?? "SOLANA";
	const saveTheme = useCallback(
		(theme: AppTheme) => {
			onThemeSettingsChange({ ...themeSettings, [activeChain]: theme });
		},
		[activeChain, onThemeSettingsChange, themeSettings],
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
	const walletFunding = useWalletFunding({
		wallet,
		fundingWallet: externalSolanaWallet,
		ticketSizeUsd: preferences?.ticketSizeUsd ?? 0.1,
	});
	const displayWallet = wallet;
	const entryView = resolveAppEntryView({
		stage,
		authenticated,
		hasEmbeddedWallet: Boolean(selectedSolanaWallet),
		hasFeed: Boolean(feed),
	});
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
		if (config.demoMode) {
			configureApiAuth(undefined);
			return () => configureApiAuth(undefined);
		}
		configureApiAuth({
			getAccessToken,
			getWalletAddress: () => wallet || undefined,
			getTxOriginAddress: () => selectedSolanaWallet?.address,
			getWalletChain: () => "SOLANA",
		});
		return () => configureApiAuth(undefined);
	}, [config.demoMode, getAccessToken, selectedSolanaWallet?.address, wallet]);

	useEffect(() => {
		removeLegacyPreferences();
	}, []);

	useEffect(() => {
		if (lastFundingWallet.current !== wallet) {
			setFundingActive(false);
			lastFundingWallet.current = wallet;
		}
	}, [wallet]);

	useEffect(() => {
		if (!planNotice) return;
		const timer = window.setTimeout(() => setPlanNotice(""), 3_000);
		return () => window.clearTimeout(timer);
	}, [planNotice]);

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
			setStage((current) =>
				stageAfterPrimaryNavigation({
					currentStage: current,
					target,
					fundingActive,
					hasFeed: Boolean(feed),
				}),
			);
		};

		window.addEventListener("popstate", handlePopState);
		return () => window.removeEventListener("popstate", handlePopState);
	}, [feed, fundingActive]);

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
		async (
			preferences: OnboardingPreferences,
			options: {
				persistPreferences?: boolean;
				skipFundingCheck?: boolean;
				accountState?: "new" | "returning";
			} = {},
		) => {
			const sessionSolanaWallet = selectedSolanaWallet;
			const sessionWallet = sessionSolanaWallet?.address;
			configureApiAuth({
				getAccessToken,
				getWalletAddress: () => sessionWallet,
				getTxOriginAddress: () => sessionSolanaWallet?.address,
				getWalletChain: () => "SOLANA",
			});
			setError("");
			setView(primaryViewFromPathname(window.location.pathname) ?? "week");
			setStage("loading");
			setPreferences(preferences);
			setSession(undefined);
			setFeed(undefined);
			setIndex(0);
			setSelectedIds([]);
			setRetrySelections(undefined);
			setFeedTicketSizeUsd(undefined);
			setPeriodUsedUsd(0);
			setLoadMoreError("");
			setFeedExhausted(false);
			try {
				if (authenticated && options.persistPreferences !== false) {
					await api.savePreferences(preferences);
				}
				if (!options.skipFundingCheck) {
					const fundingCheck = await checkFundingWithin(
						(signal) =>
							walletFunding.refresh(preferences.ticketSizeUsd, signal),
						5_000,
					);
					if (
						fundingCheck.status === "resolved" &&
						shouldShowFunding(
							fundingCheck.value.state,
							options.accountState ?? "returning",
						)
					) {
						setFundingReturn("open-session");
						setFundingActive(true);
						setStage("funding");
						return;
					}
				}
				const { session: opened, feed: generated } = await openFeedSession({
					preferences,
					persistPreferences: false,
					savePreferences: api.savePreferences,
					openSession: (plan) =>
						api.openSession(
							plan.cadence,
							plan.executionProvider,
							plan.activeChain,
							plan.feedRankingProvider,
						),
					generateFeed: generateFeedWithRetry,
				});
				rememberWarnings(warningsByAssetId.current, generated);
				const budgetUsage = await api.sessionBudget(opened.id);
				setPeriodUsedUsd(Number(budgetUsage.usedBaseUnits) / 1_000_000);
				setSession(opened);
				setFeed({
					...generated,
					candidates: shuffledFeedPage(generated.candidates, opened, 0),
				});
				setIndex(0);
				setSelectedIds([]);
				setFeedUpdatedAt(Date.now());
				setFeedClock(Date.now());
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
			walletFunding.refresh,
		],
	);

	const ensureBuilderSession = useCallback(async () => {
		if (
			!config.demoMode &&
			(!privyReady || !authenticated || !selectedSolanaWallet)
		) {
			connectWallet();
			return undefined;
		}
		if (session && feed && preferences) return session;
		const plan = preferences ?? defaultBuilderPreferences();
		if (selectedSolanaWallet) {
			configureApiAuth({
				getAccessToken,
				getWalletAddress: () => selectedSolanaWallet.address,
				getTxOriginAddress: () => selectedSolanaWallet.address,
				getWalletChain: () => "SOLANA",
			});
		}
		setError("");
		try {
			await api.savePreferences(plan);
			const opened = await api.openSession(
				plan.cadence,
				plan.executionProvider,
				plan.activeChain,
				plan.feedRankingProvider,
			);
			const generated = await generateFeedWithRetry(opened.id, plan);
			rememberWarnings(warningsByAssetId.current, generated);
			const budgetUsage = await api.sessionBudget(opened.id);
			setPreferences(plan);
			setPeriodUsedUsd(Number(budgetUsage.usedBaseUnits) / 1_000_000);
			setSession(opened);
			setFeed({
				...generated,
				candidates: shuffledFeedPage(generated.candidates, opened, 0),
			});
			setFeedUpdatedAt(Date.now());
			setStage("swipe");
			if (user?.id) writeAccountPreferences(user.id, plan);
			return opened;
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "Could not prepare the Builder session.",
			);
			throw caught;
		}
	}, [
		authenticated,
		connectWallet,
		config.demoMode,
		feed,
		getAccessToken,
		preferences,
		privyReady,
		selectedSolanaWallet,
		session,
		user?.id,
	]);

	const bootstrapAccount = useCallback(async () => {
		if (!privyReady) return;
		if (!authenticated) {
			bootstrapRequestId.current += 1;
			setBootstrapIssue(undefined);
			setStage("onboarding");
			return;
		}
		if (!solanaWalletsReady || !user?.id || !selectedSolanaWallet) return;

		const requestId = bootstrapRequestId.current + 1;
		bootstrapRequestId.current = requestId;
		setBootstrapIssue(undefined);
		setStage("bootstrapping");
		const result = await resolveAccountBootstrap({
			ensureAccount: () =>
				api.accountBootstrap(
					Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
				),
			loadPreferences: api.preferences,
			readCachedPreferences: () => readAccountPreferences(user.id),
		});
		if (bootstrapRequestId.current !== requestId) return;
		if (result.state === "new") {
			const defaults = newAccountPreferences();
			writeAccountPreferences(user.id, defaults);
			await loadSession(defaults, { accountState: "new" });
			setPlanNotice("Default settings applied. Edit them anytime in Settings.");
			return;
		}
		if (result.state === "returning") {
			writeAccountPreferences(user.id, result.preferences);
			await loadSession(result.preferences, {
				persistPreferences: false,
				accountState: "returning",
			});
			setPlanNotice("Your saved plan was loaded");
			return;
		}
		setBootstrapIssue({
			state: result.state,
			message:
				result.state === "reauthenticate"
					? "Your session expired. Sign in again to continue."
					: result.error instanceof Error
						? result.error.message
						: "Could not load your investment plan.",
			hasCachedPreferences: Boolean(
				result.state === "unavailable" && result.cachedPreferences,
			),
		});
	}, [
		authenticated,
		loadSession,
		privyReady,
		selectedSolanaWallet,
		solanaWalletsReady,
		user?.id,
	]);

	useEffect(() => {
		void bootstrapAccount();
	}, [bootstrapAccount]);

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
		setLoadMoreError("");
		setFeedExhausted(false);
		setFeedUpdatedAt(undefined);
		setRefreshFeedError("");
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
	const ticketSizeUsd = feedTicketSizeUsd ?? preferences?.ticketSizeUsd ?? 10;
	const periodLimitUsd = preferences?.periodLimitUsd ?? 100;
	const availablePeriodBudgetUsd = Math.max(0, periodLimitUsd - periodUsedUsd);
	const feedBasketTotalUsd = selected.length * ticketSizeUsd;
	const feedExecutionSelections = useMemo(
		() => feedBasketSelections(selected, ticketSizeUsd),
		[selected, ticketSizeUsd],
	);
	const ideaExecutionSelections = ideaBasket.flatMap(bundleExecutionLegs);
	const executionSelections = builderBasket
		? bundleExecutionLegs(builderBasket)
		: ideaExecutionSelections.length
			? ideaExecutionSelections
			: (retrySelections ?? feedExecutionSelections);
	const reviewCandidates = executionSelections.map(
		({ candidate }) => candidate,
	);
	const stableToken = "USDC";
	const feedAgeMinutes = feedUpdatedAt
		? Math.max(0, Math.floor((feedClock - feedUpdatedAt) / 60_000))
		: 0;
	const canAddCurrent =
		selected.length < 10 &&
		feedBasketTotalUsd + ticketSizeUsd <= availablePeriodBudgetUsd;
	const addCurrentLabel = canAddCurrent
		? `Add ${ticketSizeUsd} ${stableToken}`
		: "Low balance";

	useEffect(() => {
		if (!feedUpdatedAt) return;
		const timer = window.setInterval(() => setFeedClock(Date.now()), 60_000);
		return () => window.clearInterval(timer);
	}, [feedUpdatedAt]);

	useEffect(() => {
		for (const request of chartPrefetchRequests({
			visibleAssetId: current?.assetId,
			nextAssetId,
		})) {
			void api
				.assetHistory(request.assetId, request.period)
				.catch(() => undefined);
		}
	}, [current?.assetId, nextAssetId]);

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

	const refreshFeed = useCallback(async () => {
		if (!preferences || !feed || refreshingFeed) return;
		setRefreshingFeed(true);
		setRefreshFeedError("");
		try {
			const { session: opened, feed: generated } = await openFeedSession({
				preferences,
				persistPreferences: false,
				savePreferences: api.savePreferences,
				openSession: (plan) =>
					api.openSession(
						plan.cadence,
						plan.executionProvider,
						plan.activeChain,
						plan.feedRankingProvider,
					),
				generateFeed: (sessionId, plan) =>
					api.generateFeed(sessionId, plan, selectedIds),
			});
			rememberWarnings(warningsByAssetId.current, generated);
			const shuffled = {
				...generated,
				candidates: shuffledFeedPage(generated.candidates, opened, 0),
			};
			setSession(opened);
			setFeed(mergeRefreshedFeed(feed, shuffled, selectedIds));
			setIndex(selectedIds.length);
			setFeedExhausted(false);
			setLoadMoreError("");
			setFeedUpdatedAt(Date.now());
			setFeedClock(Date.now());
		} catch (caught) {
			setRefreshFeedError(
				caught instanceof Error
					? caught.message
					: "Could not refresh the feed.",
			);
		} finally {
			setRefreshingFeed(false);
		}
	}, [feed, preferences, refreshingFeed, selectedIds]);

	const loadMoreCandidates = useCallback(async () => {
		if (!feed || !preferences || !session || loadingMore || feedExhausted)
			return;
		setLoadingMore(true);
		setLoadMoreError("");
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
				caught.code === "NO_ELIGIBLE_CANDIDATES_FOR_PREFERENCES"
			) {
				setFeedExhausted(true);
			} else {
				console.error("Could not load the next feed page", caught);
				setLoadMoreError(
					caught instanceof Error
						? caught.message
						: "Could not load more assets.",
				);
			}
		} finally {
			setLoadingMore(false);
		}
	}, [feed, feedExhausted, loadingMore, preferences, session]);

	useEffect(() => {
		if (
			!feed?.hasMore ||
			feedExhausted ||
			loadMoreError ||
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
		loadMoreError,
		loadMoreCandidates,
		loadingMore,
	]);

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
		setBuilderBasket((basket) => {
			if (!basket) return basket;
			const next = basket.holdings.filter(
				(holding) => holding.candidate.assetId !== assetId,
			);
			const weights = normalizeWeights(
				next.map((holding) => holding.weightBps),
			);
			return {
				...basket,
				holdings: next.map((holding, index) => ({
					...holding,
					weightBps: weights[index] ?? holding.weightBps,
				})),
			};
		});
		setIdeaBasket((items) =>
			items.flatMap((item) => {
				const remaining = item.holdings.filter(
					(holding) => holding.candidate.assetId !== assetId,
				);
				if (!remaining.length) return [];
				const weights = normalizeWeights(
					remaining.map((holding) => holding.weightBps),
				);
				return [
					{
						...item,
						holdings: remaining.map((holding, index) => ({
							...holding,
							weightBps: weights[index] ?? holding.weightBps,
						})),
					},
				];
			}),
		);
		setSelectedIds((ids) => ids.filter((id) => id !== assetId));
		setRetrySelections((selections) =>
			selections?.filter(
				(selection) => selection.candidate.assetId !== assetId,
			),
		);
		setFeedExhausted(false);
	}

	function navigate(target: View) {
		scrollToTop();
		setView(target);
		if (target === "week") {
			setBuilderBasket(undefined);
			setIdeaBasket([]);
		}
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
		setStage(
			stageAfterPrimaryNavigation({
				currentStage: stage,
				target: target === "receipts" ? "positions" : target,
				fundingActive,
				hasFeed: Boolean(feed),
			}),
		);
	}

	const applyWalletPreferences = useCallback(
		async (_chain: "SOLANA", solanaWallet?: ConnectedStandardSolanaWallet) => {
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
		[getAccessToken, loadSession, preferences],
	);

	const leaveFunding = useCallback(async () => {
		if (!preferences) return;
		setFundingActive(false);
		if (fundingReturn === "open-session") {
			await loadSession(preferences, {
				persistPreferences: false,
				skipFundingCheck: true,
			});
			return;
		}
		setStage(fundingReturn);
	}, [fundingReturn, loadSession, preferences]);

	if (
		entryView === "SKELETON" &&
		(view === "receipts" || !isPublicPrimaryView(view))
	) {
		if (!bootstrapIssue) return <AppBootstrapSkeleton />;
		return (
			<main className="fatal-state account-bootstrap-error">
				<h1>
					{bootstrapIssue.state === "reauthenticate"
						? "Sign in again"
						: "Your plan is temporarily unavailable"}
				</h1>
				<p>{bootstrapIssue.message}</p>
				{bootstrapIssue.hasCachedPreferences ? (
					<p>Your saved browser copy is safe and was not overwritten.</p>
				) : null}
				<button
					type="button"
					onClick={() => {
						if (bootstrapIssue.state === "reauthenticate") {
							void logout();
							return;
						}
						void bootstrapAccount();
					}}
				>
					{bootstrapIssue.state === "reauthenticate" ? "Sign in" : "Try again"}
				</button>
			</main>
		);
	}

	return (
		<>
			<FundingNotifications
				receipts={walletFunding.receipts}
				onDismiss={walletFunding.dismissReceipt}
			/>
			<AppShell
				active={stage === "review" ? reviewReturnView : view}
				onNavigate={navigate}
				wallet={displayWallet}
				onWallet={connectWallet}
				walletReady={privyReady && (!authenticated || solanaWalletsReady)}
				navigationEnabled
				solanaWallets={solanaWallets}
				selectedSolanaWallet={selectedSolanaWallet}
				onSolanaWalletChange={(selected) => {
					void applyWalletPreferences("SOLANA", selected);
				}}
			>
				{planNotice ? (
					<div className="app-notice" role="status">
						{planNotice}
					</div>
				) : null}
				{view === "market" ? (
					<CommunityIdeasScreen
						onBack={() => navigate("builder")}
						onUseIdea={(prompt) => {
							setBuilderDraft((current) => ({
								...current,
								prompt,
								portfolio: undefined,
							}));
							navigate("builder");
						}}
					/>
				) : view === "ideas" && stage !== "review" ? (
					<IdeasScreen
						session={session}
						onEnsureSession={ensureBuilderSession}
						periodLimitUsd={periodLimitUsd}
						usedUsd={
							periodUsedUsd +
							ideaBasket.reduce((sum, item) => sum + item.amountCents / 100, 0)
						}
						basketCount={ideaBasket.length}
						onAdd={(item) => setIdeaBasket((items) => [...items, item])}
						onReview={() => {
							if (!ideaBasket.length) return;
							setBuilderBasket(undefined);
							setRetrySelections(undefined);
							setReviewReturnView("ideas");
							scrollToTop();
							setStage("review");
						}}
					/>
				) : view === "builder" && stage !== "review" ? (
					<BuilderScreen
						session={session}
						periodLimitUsd={preferences?.periodLimitUsd ?? 100}
						draft={builderDraft}
						onDraftChange={setBuilderDraft}
						onEnsureSession={ensureBuilderSession}
						onExploreIdeas={() => navigate("market")}
						onReview={(basket) => {
							setIdeaBasket([]);
							setBuilderBasket(basket);
							setRetrySelections(undefined);
							setReviewReturnView("builder");
							scrollToTop();
							setStage("review");
						}}
					/>
				) : view !== "receipts" &&
					shouldShowPublicFeedPreview(view, authenticated) ? (
					<main className="swipe-page">
						<section className="swipe-workspace public-feed-preview">
							<header className="page-heading feed-page-heading">
								<div>
									<h1>Explore the Solana feed</h1>
									<p>Discover assets first. Sign in only when you want to build a basket.</p>
								</div>
							</header>
							<div className="fatal-state wallet-required-state">
								<h2>Your personalized feed is ready to open.</h2>
								<p>
									Sign in to load live Jupiter routes and add assets. Portfolio and
									 Settings stay private to your wallet.
								</p>
								<button
									type="button"
									onClick={connectWallet}
									disabled={!privyReady}
								>
									{privyReady ? "Open my feed" : "Loading wallet…"}
								</button>
							</div>
						</section>
					</main>
				) : entryView === "WALLET_REQUIRED" ? (
					<main className="swipe-page">
						<section className="swipe-workspace">
							<header className="page-heading">
								<h1>Build your basket</h1>
								<p>Swipe right to add, left to skip.</p>
							</header>
							<div className="fatal-state wallet-required-state">
								<h2>Sign in first</h2>
								<p>
									Sign in before viewing your personalized feed and building a
									basket.
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
										: "Sign in"}
								</button>
							</div>
						</section>
					</main>
				) : stage === "onboarding" ? (
					<Onboarding
						config={config}
						onComplete={(next) => loadSession(next, { accountState: "new" })}
						privyReady={privyReady}
						onChainPreview={() => undefined}
					/>
				) : stage === "funding" && preferences ? (
					<FundingScreen
						wallet={wallet}
						state={walletFunding.state ?? "UNFUNDED"}
						usdcBalance={walletFunding.usdcBalance}
						solBalance={walletFunding.solBalance}
						ticketSizeUsd={preferences.ticketSizeUsd}
						loading={walletFunding.loading}
						error={walletFunding.error}
						qrCode={walletFunding.qrCode}
						fundingWalletAddress={externalSolanaWallet?.address}
						onCopyAddress={() => void copyWalletAddress(wallet)}
						onConnectExternalWallet={() =>
							linkWallet({
								walletChainType: "solana-only",
								description: "Connect a funding wallet.",
							})
						}
						onSendUsdc={walletFunding.sendUsdc}
						onSendSol={walletFunding.sendSol}
						onRefresh={() => walletFunding.refresh()}
						onContinue={() => void leaveFunding()}
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
						onRetryFailed={(failed) => {
							const snapshots = [
								...receiptCandidates,
								...reviewCandidates,
								...candidates,
							];
							const next = failed.flatMap((selection) => {
								const candidate = snapshots.find(
									(item) => item.assetId === selection.assetId,
								);
								return candidate
									? [
											{
												candidate,
												amountInBaseUnits: selection.amountInBaseUnits,
											},
										]
									: [];
							});
							if (!next.length) {
								setError(
									"The failed asset snapshot is unavailable. Build a new basket instead.",
								);
								return;
							}
							setSelectedIds(next.map(({ candidate }) => candidate.assetId));
							setRetrySelections(next);
							setSettlement(undefined);
							navigate("week");
							setStage("review");
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
				) : view === "settings" && preferences ? (
					<AccountScreen
						wallet={wallet}
						fundingWallet={externalSolanaWallet}
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
							setView(reviewReturnView);
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
						onTopUp={() => {
							setFundingReturn("review");
							setFundingActive(true);
							setStage("funding");
						}}
						periodLimitUsd={periodLimitUsd}
						wallet={wallet}
						liveExecution={config.executionMode !== "demo"}
						liveBroadcastEnabled={config.liveBroadcastEnabled}
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
							<header className="page-heading feed-page-heading">
								<div>
									<h1>Build your basket</h1>
									<p>Swipe right to add left to skip.</p>
								</div>
								{feed ? (
									<div className="feed-refresh-control">
										<small>
											{feedAgeMinutes === 0
												? "Updated just now"
												: `Updated ${feedAgeMinutes} min ago`}
										</small>
										<button
											type="button"
											className="button button-outline"
											onClick={() => void refreshFeed()}
											disabled={refreshingFeed}
										>
											{refreshingFeed ? "Refreshing…" : "Refresh feed"}
										</button>
									</div>
								) : null}
							</header>
							{refreshFeedError ? (
								<div className="error-message" role="alert">
									{refreshFeedError}
								</div>
							) : null}
							{walletFunding.state && walletFunding.state !== "READY" ? (
								<div className="funding-banner" role="status">
									<div>
										<strong>Your wallet needs funding</strong>
										<span>
											Add USDC for investments and SOL for network fees before
											checkout.
										</span>
									</div>
									<button
										type="button"
										className="button button-primary"
										onClick={() => {
											setFundingReturn("swipe");
											setFundingActive(true);
											setStage("funding");
										}}
									>
										Fund wallet
									</button>
								</div>
							) : walletFunding.error ? (
								<div className="funding-banner is-error" role="status">
									<div>
										<strong>Could not check wallet balance</strong>
										<span>Retry the balance check before checkout.</span>
									</div>
									<button
										type="button"
										className="button button-outline"
										onClick={() => void walletFunding.refresh()}
										disabled={walletFunding.loading}
									>
										{walletFunding.loading ? "Checking…" : "Retry"}
									</button>
								</div>
							) : null}
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
											{addCurrentLabel} <ChevronRight aria-hidden="true" />
										</button>
									</div>
								</>
							) : loadingMore ? (
								<FeedCardSkeleton
									message="Finding more assets…"
									detail="Your selected basket stays ready to review."
								/>
							) : loadMoreError ? (
								<div className="fatal-state">
									<h2>Could not load more assets</h2>
									<p>{loadMoreError}</p>
									<button
										type="button"
										onClick={() => void loadMoreCandidates()}
									>
										Try again
									</button>
								</div>
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
									<button
										type="button"
										className="button button-outline"
										onClick={() => void refreshFeed()}
										disabled={refreshingFeed}
									>
										Refresh feed
									</button>
								</div>
							)}
						</section>
						<BudgetRail
							selected={selected}
							onRemove={removeFeedAsset}
							ticketSizeUsd={ticketSizeUsd}
							periodLimitUsd={availablePeriodBudgetUsd}
							cadence={preferences?.cadence ?? "weekly"}
						/>
					</main>
				)}
			</AppShell>
		</>
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

function defaultBuilderPreferences(): OnboardingPreferences {
	return {
		executionProvider: "JUPITER",
		activeChain: "SOLANA",
		feedRankingProvider: "DETERMINISTIC",
		cadence: "weekly",
		periodLimitUsd: 100,
		ticketSizeUsd: 10,
		riskMode: "balanced",
		assetClasses: ["CRYPTO", "STOCK_TOKEN"],
		riskDisclosureAccepted: true,
	};
}
