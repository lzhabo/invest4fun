import { BaggageClaim, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	allocateWeightedCents,
	type BundleBasketItem,
	excludedBundleHoldings,
	IDEA_BUNDLES,
	MICRO_IDEA_AMOUNT_CENTS,
	MICRO_IDEA_MIN_HOLDINGS,
	minimumBundleAmountCents,
	minimumWeightedAmountCents,
	resolveMicroBundleHoldings,
} from "../../domain/ideas";
import {
	api,
	type BuilderPreflightIssue,
	type BuilderPreflightResponse,
	type WeeklySession,
} from "../api";
import { IdeaSwipeCard } from "./IdeaSwipeCard";

const DEFAULT_IDEA_AMOUNT_CENTS = MICRO_IDEA_AMOUNT_CENTS;

const NON_BLOCKING_PREFLIGHT_CODES = new Set([
	"INSUFFICIENT_FUNDS",
	"BALANCE_CHECK_FAILED",
]);

export function isBlockingIdeaPreflightIssue(issue: BuilderPreflightIssue) {
	return !NON_BLOCKING_PREFLIGHT_CODES.has(issue.code);
}

export function IdeasScreen({
	session,
	onEnsureSession,
	periodLimitUsd,
	usedUsd,
	basketCount,
	onAdd,
	onReview,
}: {
	session?: WeeklySession;
	onEnsureSession: () => Promise<WeeklySession | undefined>;
	periodLimitUsd: number;
	usedUsd: number;
	basketCount: number;
	onAdd: (item: BundleBasketItem) => void;
	onReview: () => void;
}) {
	const [index, setIndex] = useState(0);
	const [infoOpen, setInfoOpen] = useState(false);
	const [feedback, setFeedback] = useState<"invest" | "skip">();
	const [amounts, setAmounts] = useState<Record<string, number>>({});
	const [preflight, setPreflight] = useState<BuilderPreflightResponse>();
	const [holdings, setHoldings] = useState<BundleBasketItem["holdings"]>([]);
	const [loadingBundle, setLoadingBundle] = useState("");
	const [loadError, setLoadError] = useState("");
	const [activeSession, setActiveSession] = useState(session);
	const timer = useRef<number | undefined>(undefined);
	const bundle = IDEA_BUNDLES[index];
	const remainingCents = Math.max(
		0,
		Math.round((periodLimitUsd - usedUsd) * 100),
	);
	const defaultAmountCents = Math.min(
		Math.max(DEFAULT_IDEA_AMOUNT_CENTS, bundle?.minimumInvestmentCents ?? 0),
		remainingCents,
	);
	const amountCents = bundle ? (amounts[bundle.id] ?? defaultAmountCents) : 0;

	useEffect(() => {
		if (session) setActiveSession(session);
	}, [session]);

	useEffect(
		() => () => {
			if (timer.current !== undefined) window.clearTimeout(timer.current);
		},
		[],
	);

	useEffect(() => {
		if (!bundle || !activeSession || amountCents <= 0) {
			setPreflight(undefined);
			setHoldings([]);
			return;
		}
		let active = true;
		setPreflight(undefined);
		setHoldings([]);
		setLoadingBundle(bundle.id);
		setLoadError("");
		void (async () => {
			const discoveryAmountCents = Math.max(
				amountCents,
				minimumWeightedAmountCents(
					bundle.holdings.map((holding) => holding.weightBps),
				),
			);
			const discoveryAmounts = allocateWeightedCents(
				discoveryAmountCents,
				bundle.holdings.map((holding) => holding.weightBps),
			);
			const discovery = await api.builderPreflight(
				activeSession.id,
				bundle.holdings.map((holding, holdingIndex) => ({
					assetId: holding.assetId,
					amountInBaseUnits: (
						BigInt(discoveryAmounts[holdingIndex] ?? 0) * 10_000n
					).toString(),
				})),
				periodLimitUsd,
			);

			let candidatePool = discovery.candidates;
			let exact = discovery;
			let resolved = resolveMicroBundleHoldings(bundle, candidatePool);
			for (let attempt = 0; attempt < bundle.holdings.length; attempt += 1) {
				if (resolved.length < MICRO_IDEA_MIN_HOLDINGS) break;
				const exactAmounts = allocateWeightedCents(
					amountCents,
					resolved.map((holding) => holding.weightBps),
				);
				exact = await api.builderPreflight(
					activeSession.id,
					resolved.map((holding, holdingIndex) => ({
						assetId: holding.candidate.assetId,
						amountInBaseUnits: (
							BigInt(exactAmounts[holdingIndex] ?? 0) * 10_000n
						).toString(),
					})),
					periodLimitUsd,
				);
				const exactIds = new Set(
					exact.candidates.map((candidate) => candidate.assetId),
				);
				const failedIds = new Set([
					...resolved
						.filter((holding) => !exactIds.has(holding.candidate.assetId))
						.map((holding) => holding.candidate.assetId),
					...exact.issues.flatMap((issue) =>
						issue.assetId && isBlockingIdeaPreflightIssue(issue)
							? [issue.assetId]
							: [],
					),
				]);
				if (!failedIds.size) {
					resolved = resolveMicroBundleHoldings(bundle, exact.candidates);
					break;
				}
				candidatePool = candidatePool.filter(
					(candidate) => !failedIds.has(candidate.assetId),
				);
				resolved = resolveMicroBundleHoldings(bundle, candidatePool);
			}
			if (active) {
				setPreflight(exact);
				setHoldings(resolved);
			}
		})()
			.then((next) => {
				void next;
			})
			.catch((error) => {
				if (active)
					setLoadError(
						error instanceof Error
							? error.message
							: "Could not check this preset.",
					);
			})
			.finally(() => {
				if (active) setLoadingBundle("");
			});
		return () => {
			active = false;
		};
	}, [activeSession, amountCents, bundle, periodLimitUsd]);

	const excludedHoldings = useMemo(
		() => (bundle ? excludedBundleHoldings(bundle, holdings) : []),
		[bundle, holdings],
	);
	const minimumCents = Math.max(
		minimumBundleAmountCents(holdings),
		bundle?.minimumInvestmentCents ?? 0,
	);
	const preflightMessages = [
		...new Set(
			(preflight?.issues ?? [])
				.filter(
					(issue) => !issue.assetId && isBlockingIdeaPreflightIssue(issue),
				)
				.map((issue) => issue.message),
		),
	];
	const fundingMessages = [
		...new Set(
			(preflight?.issues ?? [])
				.filter((issue) => !isBlockingIdeaPreflightIssue(issue))
				.map(() => "You can add this Idea now. Funds are checked at checkout."),
		),
	];
	const blockingIssues = (preflight?.issues ?? []).filter(
		isBlockingIdeaPreflightIssue,
	);
	const amountValid =
		Number.isFinite(minimumCents) &&
		amountCents >= minimumCents &&
		amountCents <= remainingCents;
	const canAdd = Boolean(
		bundle &&
			holdings.length >= MICRO_IDEA_MIN_HOLDINGS &&
			amountValid &&
			!blockingIssues.length &&
			!feedback &&
			!loadingBundle,
	);

	function advance(add: boolean) {
		if (!bundle || feedback || (add && !canAdd)) return;
		setFeedback(add ? "invest" : "skip");
		timer.current = window.setTimeout(() => {
			if (add)
				onAdd({
					id: `${bundle.id}:${Date.now()}`,
					bundleId: bundle.id,
					title: bundle.title,
					amountCents,
					holdings,
				});
			setIndex((current) => current + 1);
			setPreflight(undefined);
			setHoldings([]);
			setInfoOpen(false);
			setFeedback(undefined);
		}, 300);
	}

	async function requestAdd() {
		if (activeSession) {
			advance(true);
			return;
		}
		setLoadingBundle("session");
		setLoadError("");
		try {
			const opened = await onEnsureSession();
			if (opened) setActiveSession(opened);
		} catch (error) {
			setLoadError(
				error instanceof Error ? error.message : "Could not open a session.",
			);
		} finally {
			setLoadingBundle("");
		}
	}

	if (!bundle) {
		return (
			<main className="ideas-page">
				<section className="ideas-workspace">
					<header className="page-heading">
						<h1>Investment ideas</h1>
						<p>That’s the current preset feed.</p>
					</header>
					<div className="feed-complete">
						<h2>Ideas reviewed.</h2>
						<p>
							{basketCount
								? `${basketCount} preset ${basketCount === 1 ? "is" : "are"} ready to review.`
								: "Your basket is still empty."}
						</p>
						<div className="ideas-complete-actions">
							<button
								type="button"
								className="button button-outline"
								onClick={() => setIndex(0)}
							>
								Start again
							</button>
							<button
								type="button"
								className="button button-primary"
								onClick={onReview}
								disabled={!basketCount}
							>
								Review basket ({basketCount}) <BaggageClaim />
							</button>
						</div>
					</div>
				</section>
			</main>
		);
	}

	return (
		<main className="ideas-page">
			<section className="ideas-workspace">
				<header className="page-heading">
					<h1>Investment ideas</h1>
					<p>Ready-made portfolios. Swipe right to add, left to skip.</p>
				</header>
				<div className="card-stage ideas-card-stage">
					<button
						type="button"
						className="gesture gesture-skip"
						onClick={() => advance(false)}
						aria-label="Skip preset"
						disabled={Boolean(feedback)}
					>
						<ChevronLeft />
						<span>
							Skip<small>Swipe left</small>
						</span>
					</button>
					<IdeaSwipeCard
						bundle={bundle}
						holdings={holdings}
						amountCents={amountCents}
						onAmountChange={(next) =>
							setAmounts((current) => ({ ...current, [bundle.id]: next }))
						}
						feedback={feedback}
						infoOpen={infoOpen}
						onInfoOpenChange={setInfoOpen}
						onSwipe={(add) => (add ? void requestAdd() : advance(false))}
						loading={loadingBundle === bundle.id || loadingBundle === "session"}
						routesChecked={Boolean(activeSession && preflight)}
						excludedHoldings={excludedHoldings}
					/>
					<button
						type="button"
						className="gesture gesture-add"
						onClick={() => void requestAdd()}
						aria-label={`Add ${bundle.title}`}
						disabled={Boolean(activeSession) && !canAdd}
					>
						<ChevronRight />
						<span>
							{activeSession ? "Add" : "Check"}
							<small>Swipe right</small>
						</span>
					</button>
				</div>
				{loadError ? (
					<p className="ideas-error" role="alert">
						{loadError}
					</p>
				) : null}
				{preflightMessages.map((message) => (
					<p className="ideas-error" role="alert" key={message}>
						{message}
					</p>
				))}
				{fundingMessages.map((message) => (
					<p className="ideas-warning" role="status" key={message}>
						{message}
					</p>
				))}
				{holdings.length > 0 && amountCents < minimumCents ? (
					<p className="ideas-error" role="alert">
						Enter at least {(minimumCents / 100).toFixed(2)} USDC for this
						preset.
					</p>
				) : null}
				{amountCents > remainingCents ? (
					<p className="ideas-error" role="alert">
						This preset exceeds your remaining limit.
					</p>
				) : null}
				<div className={`card-actions${basketCount ? " has-selection" : ""}`}>
					<button
						type="button"
						className="button button-skip"
						onClick={() => advance(false)}
						disabled={Boolean(feedback)}
					>
						<ChevronLeft /> Skip
					</button>
					<button
						type="button"
						className="button button-outline"
						onClick={onReview}
						disabled={!basketCount}
					>
						Review basket ({basketCount}) <BaggageClaim />
					</button>
					<button
						type="button"
						className="button button-primary"
						onClick={() => void requestAdd()}
						disabled={Boolean(activeSession) && !canAdd}
					>
						{activeSession ? "Add preset" : "Check routes"} <ChevronRight />
					</button>
				</div>
			</section>
		</main>
	);
}
