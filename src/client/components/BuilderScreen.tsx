import {
	ArrowRight,
	LoaderCircle,
	Plus,
	Sparkles,
	Trash2,
	X,
} from "lucide-react";
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	allocateWeightedCents,
	type BundleBasketItem,
} from "../../domain/ideas";
import { assetDisplayName } from "../../domain/asset-display";
import {
	normalizeWeights,
	type PortfolioDraft,
	type PortfolioDraftHolding,
	rebalanceStrategyWeights,
	STRATEGY_MAX_HOLDINGS,
	STRATEGY_TOTAL_WEIGHT_BPS,
	weightsWithNewHolding,
} from "../../domain/strategies";
import {
	type AssetHistoryResponse,
	api,
	type BuilderCatalogItem,
	type BuilderPreflightIssue,
	type BuilderPreflightResponse,
	type HistoryPeriod,
	type WeeklySession,
} from "../api";
import { chartPointsFromPrices } from "../chart-animation";
import { chartDateLabels, chartPriceTicks } from "../chart-history";
import { weightedBundleHistory } from "../weighted-bundle-history";
import { AssetMark } from "./AssetMark";
import { ChartShape } from "./SwipeCard";

const EXAMPLE_PROMPTS = [
	"Quantum computing",
	"China consumer growth",
	"Hedge an AI bubble",
] as const;
const HISTORY_PERIODS = ["1M", "3M", "1Y"] as const;
const REAL_HISTORY_SOURCES = new Set(["coingecko", "nasdaq", "yahoo"]);

export interface BuilderDraft {
	prompt: string;
	portfolio?: PortfolioDraft;
	amountCents: number;
}

export function shouldSubmitBuilderPromptOnKeyDown({
	key,
	shiftKey,
	isComposing,
}: Pick<KeyboardEvent<HTMLTextAreaElement>, "key" | "shiftKey"> & {
	isComposing: boolean;
}) {
	return key === "Enter" && !shiftKey && !isComposing;
}

export function builderReviewBlocker({
	hasPortfolio,
	checking,
	generating,
	preflight,
	now,
}: {
	hasPortfolio: boolean;
	checking: boolean;
	generating: boolean;
	preflight?: BuilderPreflightResponse;
	now: number;
}) {
	if (!hasPortfolio) return "Generate a portfolio draft first.";
	if (generating) return "Wait for portfolio generation to finish.";
	if (checking) return "Checking routes, limits, and wallet balance…";
	if (!preflight) return "Run the latest portfolio checks before review.";
	if (Date.parse(preflight.expiresAt) <= now)
		return "Portfolio checks are stale. Rechecking is required.";
	return preflight.issues[0]?.message;
}

export function friendlyGenerationError(error: unknown) {
	const code =
		error instanceof Error ? (error.message.split(":", 1)[0] ?? "") : "";
	if (code === "STRATEGY_NO_RELEVANT_ASSETS") {
		return "No executable assets matched this thesis. Try a broader idea.";
	}
	if (code.startsWith("MODEL_") || code.startsWith("STRATEGY_")) {
		return "The AI returned an invalid draft. Your previous draft is unchanged; please try again.";
	}
	if (code.startsWith("ZG_") || code === "UNVERIFIED_PRIVATE_INFERENCE") {
		return "Private AI generation is temporarily unavailable. Your previous draft is unchanged.";
	}
	return error instanceof Error
		? error.message
		: "Could not generate a portfolio draft.";
}

export function builderPerformanceChart(
	history: AssetHistoryResponse | undefined,
) {
	const portfolioValues = history?.points.map((point) => point.price) ?? [];
	const benchmarkValues =
		history?.benchmarkPoints?.map((point) => point.price) ?? [];
	if (
		portfolioValues.length < 2 ||
		benchmarkValues.length < 2 ||
		![...portfolioValues, ...benchmarkValues].every(
			(value) => Number.isFinite(value) && value > 0,
		)
	)
		return undefined;

	const domainValues = [...portfolioValues, ...benchmarkValues];
	const domain = {
		min: Math.min(...domainValues),
		max: Math.max(...domainValues),
	};
	let high = portfolioValues[0] ?? 100;
	let maxDrawdown = 0;
	for (const value of portfolioValues) {
		high = Math.max(high, value);
		maxDrawdown = Math.min(maxDrawdown, (value / high - 1) * 100);
	}
	const dates = chartDateLabels(history);
	return {
		portfolioPoints: chartPointsFromPrices(portfolioValues, domain),
		benchmarkPoints: chartPointsFromPrices(benchmarkValues, domain),
		priceTicks: chartPriceTicks(domainValues),
		portfolioReturn:
			((portfolioValues.at(-1) ?? 100) / (portfolioValues[0] ?? 100) - 1) * 100,
		benchmarkReturn:
			((benchmarkValues.at(-1) ?? 100) / (benchmarkValues[0] ?? 100) - 1) * 100,
		maxDrawdown,
		startDate: dates[0] ?? "",
		endDate: dates[1] ?? "",
	};
}

export function formatPerformancePercent(value: number) {
	return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function parseUsdcInput(value: string) {
	const match = value.trim().match(/^(\d+)(?:[.,](\d{0,2}))?$/);
	if (!match) return undefined;
	const wholeCents = Number(match[1]) * 100;
	const fractionalCents = Number((match[2] ?? "").padEnd(2, "0"));
	const cents = wholeCents + fractionalCents;
	return Number.isSafeInteger(cents) && cents >= 10 ? cents : undefined;
}

export function formatUsdcInput(amountCents: number) {
	const whole = Math.floor(amountCents / 100);
	const fraction = String(amountCents % 100).padStart(2, "0");
	return `${whole}.${fraction}`;
}

function UsdcTotalInput({
	amountCents,
	onCommit,
}: {
	amountCents: number;
	onCommit: (amountCents: number) => void;
}) {
	const formattedAmount = formatUsdcInput(amountCents);
	const [value, setValue] = useState(formattedAmount);

	useEffect(() => setValue(formattedAmount), [formattedAmount]);

	function commit() {
		const nextAmountCents = parseUsdcInput(value);
		if (nextAmountCents === undefined) {
			setValue(formattedAmount);
			return;
		}
		setValue(formatUsdcInput(nextAmountCents));
		if (nextAmountCents !== amountCents) onCommit(nextAmountCents);
	}

	return (
		<input
			id="builder-total-usdc"
			type="text"
			aria-label="Total, USDC"
			inputMode="decimal"
			autoComplete="off"
			spellCheck={false}
			value={value}
			onChange={(event) => {
				const nextValue = event.target.value;
				if (/^\d*(?:[.,]\d{0,2})?$/.test(nextValue)) setValue(nextValue);
			}}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === "Enter") event.currentTarget.blur();
				if (event.key === "Escape") {
					setValue(formattedAmount);
					event.currentTarget.blur();
				}
			}}
		/>
	);
}

function formatPerformanceTick(value: number) {
	const percent = value - 100;
	return `${percent > 0 ? "+" : ""}${percent.toFixed(Math.abs(percent) < 10 ? 1 : 0)}%`;
}

export function BuilderScreen({
	session,
	periodLimitUsd,
	draft,
	onDraftChange,
	onEnsureSession,
	onReview,
	onExploreIdeas,
}: {
	session?: WeeklySession;
	periodLimitUsd: number;
	draft: BuilderDraft;
	onDraftChange: (draft: BuilderDraft) => void;
	onEnsureSession: () => Promise<WeeklySession | undefined>;
	onReview: (basket: BundleBasketItem) => void;
	onExploreIdeas: () => void;
}) {
	const [catalog, setCatalog] = useState<BuilderCatalogItem[]>([]);
	const [catalogError, setCatalogError] = useState("");
	const [generating, setGenerating] = useState(false);
	const [generationError, setGenerationError] = useState("");
	const [checking, setChecking] = useState(false);
	const [reviewing, setReviewing] = useState(false);
	const [preflight, setPreflight] = useState<BuilderPreflightResponse>();
	const [preflightError, setPreflightError] = useState("");
	const [now, setNow] = useState(() => Date.now());
	const [historyPeriod, setHistoryPeriod] =
		useState<(typeof HISTORY_PERIODS)[number]>("1M");
	const [history, setHistory] = useState<AssetHistoryResponse>();
	const holdings = draft.portfolio?.holdings ?? [];
	const amounts = useMemo(
		() =>
			allocateWeightedCents(
				draft.amountCents,
				holdings.map((holding) => holding.weightBps),
			),
		[draft.amountCents, holdings],
	);
	const selectionInput = useMemo(
		() =>
			holdings.map((holding, index) => ({
				assetId: holding.assetId,
				amountInBaseUnits: (BigInt(amounts[index] ?? 0) * 10_000n).toString(),
			})),
		[amounts, holdings],
	);

	useEffect(() => {
		let cancelled = false;
		api
			.builderCandidates()
			.then(({ assets }) => {
				if (!cancelled) setCatalog(assets);
			})
			.catch((error) => {
				if (!cancelled)
					setCatalogError(
						error instanceof Error ? error.message : "Could not load assets.",
					);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const runPreflight = useCallback(
		async (activeSession: WeeklySession) => {
			if (!selectionInput.length) return undefined;
			setChecking(true);
			setPreflightError("");
			try {
				const result = await api.builderPreflight(
					activeSession.id,
					selectionInput,
					periodLimitUsd,
				);
				setPreflight(result);
				setNow(Date.now());
				return result;
			} catch (error) {
				setPreflight(undefined);
				setPreflightError(
					error instanceof Error ? error.message : "Portfolio checks failed.",
				);
				return undefined;
			} finally {
				setChecking(false);
			}
		},
		[periodLimitUsd, selectionInput],
	);

	useEffect(() => {
		setPreflight(undefined);
		if (!session || !selectionInput.length) return;
		const timer = window.setTimeout(() => void runPreflight(session), 250);
		return () => window.clearTimeout(timer);
	}, [runPreflight, selectionInput.length, session]);

	useEffect(() => {
		if (!preflight) return;
		const timer = window.setInterval(() => setNow(Date.now()), 1_000);
		return () => window.clearInterval(timer);
	}, [preflight]);

	useEffect(() => {
		if (
			!preflight ||
			!session ||
			checking ||
			Date.parse(preflight.expiresAt) > now
		)
			return;
		void runPreflight(session);
	}, [checking, now, preflight, runPreflight, session]);

	useEffect(() => {
		if (!holdings.length) {
			setHistory(undefined);
			return;
		}
		let cancelled = false;
		const benchmark = catalog.find(
			(item) => item.symbol.toUpperCase() === "SPYX",
		);
		if (!benchmark) {
			setHistory(undefined);
			return;
		}
		setHistory(undefined);
		void Promise.all([
			weightedBundleHistory(holdings, historyPeriod),
			api.assetHistory(benchmark.assetId, historyPeriod as HistoryPeriod),
		])
			.then(([portfolioHistory, benchmarkHistory]) => {
				if (cancelled) return;
				if (
					!REAL_HISTORY_SOURCES.has(portfolioHistory.source) ||
					!REAL_HISTORY_SOURCES.has(benchmarkHistory.source) ||
					portfolioHistory.points.length < 2 ||
					benchmarkHistory.points.length < 2
				) {
					setHistory(undefined);
					return;
				}
				const benchmarkValues = normalizePriceSeries(
					benchmarkHistory.points.map((point) => point.price),
				);
				if (benchmarkValues.length < 2) {
					setHistory(undefined);
					return;
				}
				setHistory({
					...portfolioHistory,
					benchmarkPoints: benchmarkHistory.points.map((point, index) => ({
						timestamp: point.timestamp,
						price: benchmarkValues[index] ?? 100,
					})),
				});
			})
			.catch(() => {
				if (!cancelled) setHistory(undefined);
			});
		return () => {
			cancelled = true;
		};
	}, [catalog, historyPeriod, holdings]);

	async function generate() {
		const prompt = draft.prompt.trim();
		if (!prompt || generating) return;
		setGenerating(true);
		setGenerationError("");
		try {
			const activeSession = session ?? (await onEnsureSession());
			if (!activeSession) {
				setGenerationError(
					"Sign in and connect a Solana wallet to generate a draft.",
				);
				return;
			}
			const result = await api.generateStrategy({
				prompt,
				maxHoldings: STRATEGY_MAX_HOLDINGS,
			});
			onDraftChange({ ...draft, prompt, portfolio: result.portfolioDraft });
		} catch (error) {
			setGenerationError(friendlyGenerationError(error));
		} finally {
			setGenerating(false);
		}
	}

	function updateHoldings(nextHoldings: PortfolioDraftHolding[]) {
		if (!draft.portfolio) return;
		onDraftChange({
			...draft,
			portfolio: { ...draft.portfolio, holdings: nextHoldings },
		});
		setPreflight(undefined);
	}

	function removeHolding(assetId: string) {
		const next = holdings.filter((holding) => holding.assetId !== assetId);
		const weights = normalizeWeights(next.map((holding) => holding.weightBps));
		updateHoldings(
			next.map((holding, index) => ({
				...holding,
				weightBps: weights[index] ?? STRATEGY_TOTAL_WEIGHT_BPS,
			})),
		);
	}

	function addHolding(asset: BuilderCatalogItem) {
		if (
			!draft.portfolio ||
			holdings.length >= STRATEGY_MAX_HOLDINGS ||
			holdings.some((holding) => holding.assetId === asset.assetId)
		)
			return;
		const weights = weightsWithNewHolding(
			holdings.map((holding) => holding.weightBps),
		);
		const next: PortfolioDraftHolding[] = [
			...holdings.map((holding, index) => ({
				...holding,
				weightBps: weights[index] ?? holding.weightBps,
			})),
			{
				...asset,
				weightBps: weights[weights.length - 1] ?? STRATEGY_TOTAL_WEIGHT_BPS,
				scoreBps: 0,
				reason: "Added by you to this portfolio draft.",
				exposureType: "DIRECT",
			},
		];
		updateHoldings(next);
	}

	function updateWeight(index: number, percent: number) {
		const weights = rebalanceStrategyWeights(holdings, index, percent * 100);
		if (!weights.length) return;
		updateHoldings(
			holdings.map((holding, holdingIndex) => ({
				...holding,
				weightBps: weights[holdingIndex] ?? holding.weightBps,
			})),
		);
	}

	function updateAmount(index: number, dollars: number) {
		const requestedCents = Math.round(dollars * 100);
		if (!Number.isInteger(requestedCents) || requestedCents < 0) return;
		const nextAmounts = amounts.map((amount, amountIndex) =>
			amountIndex === index ? requestedCents : amount,
		);
		const totalCents = nextAmounts.reduce((sum, amount) => sum + amount, 0);
		const weights = normalizeWeights(nextAmounts);
		if (!totalCents || weights.length !== holdings.length) return;
		onDraftChange({
			...draft,
			amountCents: totalCents,
			portfolio: draft.portfolio
				? {
						...draft.portfolio,
						holdings: holdings.map((holding, holdingIndex) => ({
							...holding,
							weightBps: weights[holdingIndex] ?? holding.weightBps,
						})),
					}
				: undefined,
		});
		setPreflight(undefined);
	}

	async function review() {
		if (!draft.portfolio || reviewing) return;
		setReviewing(true);
		try {
			const activeSession = session ?? (await onEnsureSession());
			if (!activeSession) return;
			const latest = await runPreflight(activeSession);
			if (
				!latest ||
				latest.issues.length ||
				Date.parse(latest.expiresAt) <= Date.now()
			)
				return;
			const candidates = new Map(
				latest.candidates.map((candidate) => [candidate.assetId, candidate]),
			);
			const resolved = holdings.flatMap((holding) => {
				const candidate = candidates.get(holding.assetId);
				return candidate
					? [
							{
								candidate,
								weightBps: holding.weightBps,
								sourceWeightBps: holding.weightBps,
							},
						]
					: [];
			});
			if (resolved.length !== holdings.length) {
				setPreflightError(
					"An asset snapshot is missing. Recheck the portfolio.",
				);
				return;
			}
			onReview({
				id: `builder:${draft.portfolio.id}`,
				bundleId: draft.portfolio.id,
				title: draft.portfolio.name,
				amountCents: draft.amountCents,
				holdings: resolved,
			});
		} finally {
			setReviewing(false);
		}
	}

	const blocker = builderReviewBlocker({
		hasPortfolio: Boolean(draft.portfolio && holdings.length),
		checking: checking || reviewing,
		generating,
		preflight,
		now,
	});
	const issuesByAsset = useMemo(() => {
		const result = new Map<string, BuilderPreflightIssue[]>();
		for (const issue of preflight?.issues ?? []) {
			if (!issue.assetId) continue;
			result.set(issue.assetId, [...(result.get(issue.assetId) ?? []), issue]);
		}
		return result;
	}, [preflight]);
	const availableAssets = catalog.filter(
		(asset) => !holdings.some((holding) => holding.assetId === asset.assetId),
	);
	const totalWeight = holdings.reduce(
		(sum, holding) => sum + holding.weightBps,
		0,
	);
	const performanceChart = useMemo(
		() => builderPerformanceChart(history),
		[history],
	);

	return (
		<main
			className={`builder-page builder-page-reference${draft.portfolio ? "" : " builder-page-empty"}`}
		>
			<section className="builder-workspace">
				<header className="page-heading builder-header">
					{draft.portfolio ? null : (
						<span>
							<Sparkles aria-hidden="true" /> AI portfolio builder
						</span>
					)}
					<h1>
						{draft.portfolio
							? "AI portfolio builder"
							: "What should your portfolio believe in?"}
					</h1>
					<p>
						{draft.portfolio
							? "Turn any idea into an editable portfolio draft with AI. Review every allocation, compare historical data, then check live routes before continuing."
							: "Describe a trend, company, market, or hedge. You can edit every allocation before review and signing."}
					</p>
				</header>

				<form
					className={`builder-composer${draft.portfolio ? " builder-composer-generated" : " builder-composer-empty"}`}
					onSubmit={(event) => {
						event.preventDefault();
						void generate();
					}}
				>
					<label htmlFor="builder-prompt">Your investment idea</label>
					<textarea
						id="builder-prompt"
						value={draft.prompt}
						onChange={(event) =>
							onDraftChange({ ...draft, prompt: event.target.value })
						}
						onKeyDown={(event) => {
							if (
								shouldSubmitBuilderPromptOnKeyDown({
									key: event.key,
									shiftKey: event.shiftKey,
									isComposing: event.nativeEvent.isComposing,
								})
							) {
								event.preventDefault();
								void generate();
							}
						}}
						placeholder={
							draft.portfolio
								? "Describe an investment idea"
								: "Companies benefiting from growing electricity demand…"
						}
						rows={draft.portfolio ? 1 : 3}
						maxLength={1_000}
						aria-label="Investment idea"
					/>
					<button
						type="submit"
						className="button button-primary builder-generate"
						disabled={!draft.prompt.trim() || generating}
						aria-busy={generating}
						aria-label={
							generating ? "Building portfolio" : "Generate portfolio"
						}
					>
						{generating ? (
							<LoaderCircle className="spin" aria-hidden="true" />
						) : (
							<Sparkles aria-hidden="true" />
						)}
					</button>
				</form>
				{draft.portfolio ? null : (
					<fieldset
						className="builder-suggestions"
						aria-label="Example prompts"
					>
						{EXAMPLE_PROMPTS.map((prompt) => (
							<button
								type="button"
								key={prompt}
								onClick={() => onDraftChange({ ...draft, prompt })}
							>
								{prompt}
							</button>
						))}
					</fieldset>
				)}
				<button
					type="button"
					className="builder-community-link"
					onClick={onExploreIdeas}
				>
					Explore community ideas <ArrowRight aria-hidden="true" />
				</button>
				{generationError ? (
					<p className="builder-alert" role="alert">
						{generationError}
					</p>
				) : null}

				{draft.portfolio ? (
					<div className="builder-grid">
						<section
							className="builder-draft"
							aria-labelledby="portfolio-draft-title"
						>
							<div className="builder-draft-heading">
								<div>
									<small>Portfolio draft</small>
									<h2 id="portfolio-draft-title">{draft.portfolio.name}</h2>
									<p>{draft.portfolio.description}</p>
								</div>
								<button
									type="button"
									className="builder-remove builder-close-portfolio"
									onClick={() =>
										onDraftChange({ ...draft, portfolio: undefined })
									}
									aria-label="Close generated portfolio"
								>
									<X aria-hidden="true" />
								</button>
							</div>

							<div className="builder-holdings">
								{holdings.map((holding, index) => (
									<div className="builder-holding" key={holding.assetId}>
										<div className="builder-holding-identity">
											<AssetMark {...holding} decorative />
											<span>
												<strong>{holding.symbol}</strong>
												<small>{holding.name}</small>
											</span>
										</div>
										<label>
											Weight
											<span>
												<input
													type="number"
													min="1"
													max="100"
													step="1"
													value={(holding.weightBps / 100).toFixed(0)}
													onChange={(event) =>
														updateWeight(index, Number(event.target.value))
													}
												/>
												%
											</span>
										</label>
										<label>
											Amount
											<span>
												$
												<input
													type="number"
													min="0.10"
													step="0.01"
													value={((amounts[index] ?? 0) / 100).toFixed(2)}
													onChange={(event) =>
														updateAmount(index, Number(event.target.value))
													}
												/>
											</span>
										</label>
										<button
											type="button"
											className="builder-remove"
											onClick={() => removeHolding(holding.assetId)}
											aria-label={`Remove ${holding.symbol}`}
										>
											<Trash2 aria-hidden="true" />
										</button>
										{issuesByAsset.get(holding.assetId)?.map((issue) => (
											<p
												className="builder-position-error"
												role="alert"
												key={issue.code}
											>
												{issue.message}
											</p>
										))}
									</div>
								))}
							</div>
							<div
								className="builder-weight-total"
								data-valid={totalWeight === STRATEGY_TOTAL_WEIGHT_BPS}
							>
								<label htmlFor="builder-total-usdc">Total allocation</label>
								<strong>{(totalWeight / 100).toFixed(0)}%</strong>
								<span className="builder-total-input">
									<UsdcTotalInput
										amountCents={draft.amountCents}
										onCommit={(amountCents) =>
											onDraftChange({ ...draft, amountCents })
										}
									/>
								</span>
								<span className="builder-total-currency">USDC</span>
							</div>

							{availableAssets.length &&
							holdings.length < STRATEGY_MAX_HOLDINGS ? (
								<details className="builder-add-assets">
									<summary>
										<Plus aria-hidden="true" /> Add holding
									</summary>
									<div>
										{availableAssets.map((asset) => (
											<button
												type="button"
												key={asset.assetId}
												onClick={() => addHolding(asset)}
											>
												<AssetMark {...asset} decorative />
												<span>
													<strong>{asset.symbol}</strong>
													<small>{assetDisplayName(asset.name)}</small>
												</span>
												<Plus aria-hidden="true" />
											</button>
										))}
									</div>
								</details>
							) : null}
							{catalogError ? (
								<p className="builder-alert" role="alert">
									{catalogError}
								</p>
							) : null}
						</section>

						<aside className="builder-sidebar">
							{performanceChart ? (
								<section className="builder-history">
									<div className="builder-history-heading">
										<div>
											<small>Hypothetical historical comparison</small>
											<h3>Draft vs S&amp;P 500</h3>
										</div>
										<select
											aria-label="History period"
											value={historyPeriod}
											onChange={(event) =>
												setHistoryPeriod(
													event.target.value as typeof historyPeriod,
												)
											}
										>
											{HISTORY_PERIODS.map((period) => (
												<option key={period}>{period}</option>
											))}
										</select>
									</div>
									<div className="builder-history-values">
										<span className="portfolio">
											Portfolio
											<strong>
												{formatPerformancePercent(
													performanceChart.portfolioReturn,
												)}
											</strong>
										</span>
										<span className="benchmark">
											S&amp;P 500
											<strong>
												{formatPerformancePercent(
													performanceChart.benchmarkReturn,
												)}
											</strong>
										</span>
									</div>
									<div className="builder-chart">
										<ChartShape
											points={performanceChart.portfolioPoints}
											benchmarkPoints={performanceChart.benchmarkPoints}
											label={
												"Hypothetical " +
												historyPeriod +
												" portfolio draft comparison with S&P 500"
											}
										/>
										<div className="builder-chart-prices" aria-hidden="true">
											{[5, 12.67, 20.33, 28].map((y, index) => (
												<span style={{ top: `${(y / 32) * 100}%` }} key={y}>
													{formatPerformanceTick(
														performanceChart.priceTicks[index] ?? 100,
													)}
												</span>
											))}
										</div>
									</div>
									<div className="builder-chart-dates" aria-hidden="true">
										<span>{performanceChart.startDate}</span>
										<span>{performanceChart.endDate}</span>
									</div>
									<p>
										Illustrative only · real historical data · {historyPeriod} ·
										benchmark S&amp;P 500. Past performance does not predict
										future results.
									</p>
								</section>
							) : null}
							<section className="builder-preflight" aria-live="polite">
								<h3>Ready for review?</h3>
								<p>
									Routes, minimums, budget, and your latest wallet balance are
									checked again before review.
								</p>
								{preflightError ? (
									<p className="builder-alert" role="alert">
										{preflightError}
									</p>
								) : null}
								{preflight?.issues
									.filter((issue) => !issue.assetId)
									.map((issue) => (
										<p className="builder-alert" role="alert" key={issue.code}>
											{issue.message}
										</p>
									))}
								{blocker &&
								!preflight?.issues.some(
									(issue) => !issue.assetId && issue.message === blocker,
								) ? (
									<p className="builder-review-blocker">{blocker}</p>
								) : (
									!blocker && (
										<p className="builder-check-ok">Latest checks passed.</p>
									)
								)}
								<button
									type="button"
									className="button button-primary builder-review"
									disabled={Boolean(blocker) || reviewing}
									aria-busy={checking || reviewing}
									onClick={() => void review()}
								>
									{checking || reviewing ? (
										<LoaderCircle className="spin" aria-hidden="true" />
									) : null}
									Review portfolio <ArrowRight aria-hidden="true" />
								</button>
								<small>
									Review is separate from wallet signing and submission.
								</small>
							</section>
						</aside>
					</div>
				) : null}
			</section>
		</main>
	);
}

function normalizePriceSeries(prices: number[]) {
	const first = prices[0];
	if (!first) return [];
	return prices.map((price) => (price / first) * 100);
}
