import { BaggageClaim, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	allocateWeightedCents,
	type BundleBasketItem,
	IDEA_BUNDLES,
	minimumBundleAmountCents,
	resolveBundleHoldings,
} from "../../domain/ideas";
import { api, type BuilderPreflightResponse, type WeeklySession } from "../api";
import { IdeaSwipeCard } from "./IdeaSwipeCard";

const DEFAULT_IDEA_AMOUNT_CENTS = 10_000;

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
			return;
		}
		let active = true;
		const amountsByHolding = allocateWeightedCents(
			amountCents,
			bundle.holdings.map((holding) => holding.weightBps),
		);
		setPreflight(undefined);
		setLoadingBundle(bundle.id);
		setLoadError("");
		void api
			.builderPreflight(
				activeSession.id,
				bundle.holdings.map((holding, holdingIndex) => ({
					assetId: holding.assetId,
					amountInBaseUnits: (
						BigInt(amountsByHolding[holdingIndex] ?? 0) * 10_000n
					).toString(),
				})),
				periodLimitUsd,
			)
			.then((next) => {
				if (active) setPreflight(next);
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

	const holdings = useMemo(
		() =>
			bundle ? resolveBundleHoldings(bundle, preflight?.candidates ?? []) : [],
		[bundle, preflight],
	);
	const minimumCents = Math.max(
		minimumBundleAmountCents(holdings),
		bundle?.minimumInvestmentCents ?? 0,
	);
	const preflightMessages = [
		...new Set((preflight?.issues ?? []).map((issue) => issue.message)),
	];
	const amountValid =
		Number.isFinite(minimumCents) &&
		amountCents >= minimumCents &&
		amountCents <= remainingCents;
	const canAdd = Boolean(
		bundle &&
			holdings.length === bundle.holdings.length &&
			amountValid &&
			!preflight?.issues.length &&
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
