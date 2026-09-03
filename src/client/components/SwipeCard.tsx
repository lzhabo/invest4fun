import { CircleHelp, Dot, Sparkle, WandSparkles } from "lucide-react";
import {
	type CSSProperties,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { visibleAssetTags } from "../../domain/asset-tag-config";
import { assetDisplayName } from "../../domain/asset-display";
import type { Candidate } from "../../domain/schemas";
import {
	type AssetDetailsResponse,
	type AssetHistoryResponse,
	api,
	type HistoryPeriod,
} from "../api";
import {
	type ChartPoint,
	chartPointsAttribute,
	chartPointsFromPrices,
	chartPolygonAttribute,
	interpolateChartPoints,
} from "../chart-animation";
import {
	chartDateLabels,
	chartPriceTicks,
	HISTORY_PERIODS,
} from "../chart-history";
import { INITIAL_CHART_PERIOD } from "../chart-loading-policy";
import { formatChartAxisUsdPrice, formatUsdPrice } from "../price-format";
import { parseCardAmountInput } from "../card-amount";
import { AssetMark } from "./AssetMark";

const SWIPE_THRESHOLD_PX = 72;
const LOADING_DOTS = Array.from({ length: 32 }, (_, index) => index);
const LOADING_BREATH_MS = 1_500;
const DECORATIVE_LOADING_ICONS = [Sparkle, Sparkle, Sparkle, Sparkle] as const;

function randomizedDecorativeIcons(previousSlots: ReadonlySet<number>) {
	const slots = LOADING_DOTS.filter((slot) => !previousSlots.has(slot));
	for (let index = slots.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(Math.random() * (index + 1));
		const currentSlot = slots[index];
		const swapSlot = slots[swapIndex];
		if (currentSlot === undefined || swapSlot === undefined) continue;
		slots[index] = swapSlot;
		slots[swapIndex] = currentSlot;
	}
	return new Map(
		DECORATIVE_LOADING_ICONS.map((Icon, index) => [slots[index], Icon]),
	);
}

export function ChartLoadingDots({
	decorated = false,
}: {
	decorated?: boolean;
}) {
	const [decorativeIcons, setDecorativeIcons] = useState(() =>
		decorated ? randomizedDecorativeIcons(new Set()) : new Map(),
	);

	useEffect(() => {
		if (
			!decorated ||
			typeof window === "undefined" ||
			window.matchMedia("(prefers-reduced-motion: reduce)").matches
		)
			return;
		const interval = window.setInterval(() => {
			setDecorativeIcons((current) =>
				randomizedDecorativeIcons(new Set(current.keys())),
			);
		}, LOADING_BREATH_MS);
		return () => window.clearInterval(interval);
	}, [decorated]);

	return (
		<div
			className={`chart-loading-dots${decorated ? " is-decorated" : ""}`}
			style={
				decorated
					? ({
							"--loading-breath-duration": `${LOADING_BREATH_MS}ms`,
						} as CSSProperties)
					: undefined
			}
			aria-hidden="true"
		>
			{LOADING_DOTS.map((index) => {
				const Icon = decorativeIcons.get(index) ?? Dot;
				const iconName = Icon === Sparkle ? "sparkle" : "dot";
				const animationDelay = `${(3 - Math.floor(index / 8)) * 90}ms`;
				return decorated ? (
					<Icon
						key={index}
						className={
							Icon === Dot
								? "loading-dot-icon"
								: `loading-star-icon loading-${iconName}-icon`
						}
						data-loading-icon={iconName}
						style={{ animationDelay }}
					/>
				) : (
					<i key={index} style={{ animationDelay }} />
				);
			})}
		</div>
	);
}

export function ChartLoading({ label }: { label: string }) {
	return (
		<>
			<div className="chart-loading" role="status" aria-live="polite">
				<span className="sr-only">{label}</span>
				<ChartLoadingDots />
			</div>
			<div className="chart-dates chart-dates-placeholder" aria-hidden="true">
				<span>&nbsp;</span>
				<span>&nbsp;</span>
				<span>&nbsp;</span>
			</div>
		</>
	);
}
const CHART_MORPH_DURATION_MS = 420;
type DecisionFeedback = "invest" | "skip";

function shortMonthYear(timestamp: number) {
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		year: "numeric",
	}).format(new Date(timestamp * 1000));
}

const CHART_TICK_Y = [5, 12.67, 20.33, 28];
const compactUsdFormatter = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	notation: "compact",
	maximumFractionDigits: 2,
});

function formatCount(value: number | undefined) {
	return value
		? new Intl.NumberFormat("en-US", { notation: "compact" }).format(value)
		: undefined;
}

export function ChartShape({
	points,
	benchmarkPoints = [],
	label,
}: {
	points: ChartPoint[];
	benchmarkPoints?: ChartPoint[];
	label: string;
}) {
	const polygonRef = useRef<SVGPolygonElement>(null);
	const lineRef = useRef<SVGPolylineElement>(null);
	const frameRef = useRef<number | undefined>(undefined);
	const currentPointsRef = useRef(points);

	useLayoutEffect(() => {
		const polygon = polygonRef.current;
		const line = lineRef.current;
		if (!polygon || !line || !points.length) return;

		if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
		const from = currentPointsRef.current;
		const applyPoints = (next: ChartPoint[]) => {
			line.setAttribute("points", chartPointsAttribute(next));
			polygon.setAttribute("points", chartPolygonAttribute(next));
			currentPointsRef.current = next;
		};
		const reducedMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		if (
			!from.length ||
			reducedMotion ||
			chartPointsAttribute(from) === chartPointsAttribute(points)
		) {
			applyPoints(points);
			return;
		}

		applyPoints(from);
		const startedAt = performance.now();
		const animate = (timestamp: number) => {
			const elapsed = Math.min(
				1,
				(timestamp - startedAt) / CHART_MORPH_DURATION_MS,
			);
			const eased = 1 - (1 - elapsed) ** 3;
			applyPoints(interpolateChartPoints(from, points, eased));
			if (elapsed < 1) frameRef.current = requestAnimationFrame(animate);
			else frameRef.current = undefined;
		};
		frameRef.current = requestAnimationFrame(animate);
		return () => {
			if (frameRef.current !== undefined)
				cancelAnimationFrame(frameRef.current);
		};
	}, [points]);

	const line = chartPointsAttribute(points);
	const benchmarkLine = chartPointsAttribute(benchmarkPoints);
	return (
		<svg
			viewBox="0 0 100 32"
			preserveAspectRatio="none"
			role="img"
			aria-label={label}
		>
			{CHART_TICK_Y.map((y) => (
				<line
					className="chart-gridline"
					x1="0"
					x2="100"
					y1={y}
					y2={y}
					key={y}
				/>
			))}
			{line ? (
				<>
					<polygon ref={polygonRef} points={chartPolygonAttribute(points)} />
					{benchmarkLine ? (
						<polyline className="chart-benchmark-line" points={benchmarkLine} />
					) : null}
					<polyline ref={lineRef} points={line} />
				</>
			) : null}
		</svg>
	);
}

function PriceSparkline({
	candidate,
	reason,
	infoOpen,
	onInfoOpenChange,
}: {
	candidate: Candidate;
	reason: string;
	infoOpen: boolean;
	onInfoOpenChange: (open: boolean) => void;
}) {
	const [period, setPeriod] = useState<HistoryPeriod>(INITIAL_CHART_PERIOD);
	const [history, setHistory] = useState<AssetHistoryResponse>();
	const [retryCount, setRetryCount] = useState(0);
	const [details, setDetails] = useState<AssetDetailsResponse>();
	const [detailsFailed, setDetailsFailed] = useState(false);

	useEffect(() => {
		if (!infoOpen || details || detailsFailed) return;
		let active = true;
		void api
			.assetDetails(candidate.assetId)
			.then((result) => active && setDetails(result))
			.catch(() => active && setDetailsFailed(true));
		return () => {
			active = false;
		};
	}, [candidate.assetId, details, detailsFailed, infoOpen]);

	useEffect(() => {
		let active = true;
		setHistory((current) =>
			current?.source === "unavailable" ? undefined : current,
		);
		void api
			.assetHistory(candidate.assetId, period, retryCount > 0)
			.then((result) => active && setHistory(result))
			.catch(
				() =>
					active && setHistory({ period, source: "unavailable", points: [] }),
			);
		return () => {
			active = false;
		};
	}, [candidate.assetId, period, retryCount]);

	const prices = useMemo(
		() => history?.points.map((point) => point.price) ?? [],
		[history],
	);
	const chartPoints = useMemo(() => chartPointsFromPrices(prices), [prices]);
	const priceTicks = useMemo(() => chartPriceTicks(prices), [prices]);
	const first = prices[0];
	const last = prices.at(-1);
	const change = first && last ? ((last - first) / first) * 100 : 0;
	const dateLabels = chartDateLabels(history);
	const displayPeriod = history?.period ?? period;
	const periodLabel =
		displayPeriod === "ALL" && history?.points[0]
			? `${history.isCompleteHistory === false ? "Max available · " : ""}Since ${shortMonthYear(history.points[0].timestamp)}`
			: displayPeriod;
	const chartLabel = `${candidate.symbol} ${periodLabel} price chart`;
	const loading = history === undefined;
	const unavailable = history?.source === "unavailable";
	const compactCommunityLinks = details
		? ["X", "Telegram"].flatMap((label) => {
				const item = details.community.find(
					(community) => community.label === label && community.url,
				);
				return item?.url ? [item] : [];
			})
		: [];

	useEffect(() => {
		if (!unavailable || retryCount >= 2) return;
		const timer = window.setTimeout(
			() => setRetryCount((count) => count + 1),
			2_000,
		);
		return () => window.clearTimeout(timer);
	}, [retryCount, unavailable]);

	return (
		<div
			className={`price-chart${change < 0 ? " is-down" : ""}${infoOpen ? " has-info" : ""}`}
		>
			<div className="chart-meta">
				<strong>{formatUsdPrice(candidate.marketPriceUsd ?? last ?? 0)}</strong>
				<span>
					{prices.length
						? `${change >= 0 ? "+" : ""}${change.toFixed(2)}% · ${periodLabel}`
						: "—"}
				</span>
			</div>
			{unavailable ? (
				<div className="chart-unavailable" role="status">
					<strong>Price history unavailable</strong>
					<span>CoinGecko market data is temporarily unavailable.</span>
					<button
						type="button"
						onClick={() => setRetryCount((count) => count + 1)}
					>
						Retry
					</button>
				</div>
			) : loading ? (
				<ChartLoading
					label={`Loading ${period === "ALL" ? "all" : period} price history`}
				/>
			) : (
				<>
					<div className="chart-plot">
						<ChartShape points={chartPoints} label={chartLabel} />
						<div className="chart-prices" aria-hidden="true">
							{CHART_TICK_Y.map((y, index) => (
								<span style={{ top: `${(y / 32) * 100}%` }} key={y}>
									{formatChartAxisUsdPrice(priceTicks[index] ?? 0)}
								</span>
							))}
						</div>
					</div>
					{dateLabels.length ? (
						<fieldset className="chart-dates">
							<legend className="sr-only">
								{periodLabel} chart date range
							</legend>
							<span>{dateLabels[0]}</span>
							<span>{dateLabels[1]}</span>
						</fieldset>
					) : null}
					{history.period !== period ? (
						<span className="sr-only" role="status">
							Loading {period} price history
						</span>
					) : null}
				</>
			)}
			<div className="chart-controls">
				<fieldset
					className="chart-timeframes"
					onPointerDown={(event) => event.stopPropagation()}
				>
					<legend className="sr-only">Chart timeframe</legend>
					{HISTORY_PERIODS.map((option) => {
						return (
							<button
								type="button"
								aria-pressed={period === option}
								aria-label={`${option === "ALL" ? "All" : option} timeframe.`}
								onClick={() => setPeriod(option)}
								key={option}
							>
								{option === "ALL" ? "All" : option}
							</button>
						);
					})}
				</fieldset>
				<button
					type="button"
					className="chart-reason-toggle"
					aria-label="Asset information"
					aria-expanded={infoOpen}
					onClick={() => onInfoOpenChange(!infoOpen)}
				>
					<CircleHelp aria-hidden="true" />
				</button>
			</div>
			{infoOpen ? (
				<div className="asset-info-panel" aria-live="polite">
					{!details && !detailsFailed ? (
						<p className="asset-info-status">Loading CoinGecko details…</p>
					) : null}
					{detailsFailed ? (
						<p className="asset-info-status">Asset details are unavailable.</p>
					) : null}
					{details ? (
						<>
							<div className="asset-info-tags">
								<div>
									{candidate.marketCapRank ? (
										candidate.coingeckoId ? (
											<a
												className="asset-rank-tag is-coingecko"
												href={`https://www.coingecko.com/en/coins/${encodeURIComponent(candidate.coingeckoId)}`}
												target="_blank"
												rel="noopener noreferrer"
												aria-label={`View ${assetDisplayName(candidate.name)} on CoinGecko`}
											>
												<img src="/assets/providers/coingecko.svg" alt="" />
												Rank #{candidate.marketCapRank}
												<span aria-hidden="true">↗</span>
											</a>
										) : (
											<span className="asset-rank-tag is-coingecko">
												<img src="/assets/providers/coingecko.svg" alt="" />
												Rank #{candidate.marketCapRank}
											</span>
										)
									) : null}
									{visibleAssetTags(details.categories).map((tag) => (
										<span
											className={`asset-tag is-${tag.tone}`}
											key={tag.source}
										>
											{tag.label}
										</span>
									))}
									{!visibleAssetTags(details.categories).length &&
									!candidate.marketCapRank &&
									!candidate.providerVolumeRank
										? "Not listed"
										: null}
								</div>
							</div>
							<div className="asset-info-metrics">
								<dl>
									<div>
										<dt>Market Cap:</dt>
										<dd>
											{details.marketCapUsd !== undefined
												? compactUsdFormatter.format(details.marketCapUsd)
												: "—"}
										</dd>
									</div>
									<div>
										<dt>24H Volume:</dt>
										<dd>
											{(candidate.volume24hUsd ?? details.volume24hUsd)
												? compactUsdFormatter.format(
														candidate.volume24hUsd ?? details.volume24hUsd ?? 0,
													)
												: "—"}
										</dd>
									</div>
								</dl>
								<dl>
									<div>
										<dt>Liquidity:</dt>
										<dd>
											{candidate.liquidityUsd !== undefined
												? compactUsdFormatter.format(candidate.liquidityUsd)
												: "—"}
										</dd>
									</div>
									<div>
										<dt>Token Holders:</dt>
										<dd>{formatCount(details.holderCount) ?? "—"}</dd>
									</div>
								</dl>
							</div>
							<div className="asset-info-link-row">
								<strong>Links:</strong>
								<div>
									{details.websiteUrl ? (
										<a
											href={details.websiteUrl}
											target="_blank"
											rel="noopener noreferrer"
										>
											Website ↗
										</a>
									) : null}
									{compactCommunityLinks.map((item) => (
										<a
											href={item.url}
											target="_blank"
											rel="noopener noreferrer"
											key={item.label}
										>
											{item.label} ↗
										</a>
									))}
									{!details.websiteUrl && !compactCommunityLinks.length ? (
										<span>Not listed</span>
									) : null}
								</div>
							</div>
							<p className="asset-info-reason">{reason}</p>
						</>
					) : null}
				</div>
			) : null}
		</div>
	);
}

export function SwipeCard({
	candidate,
	reason,
	ticketSizeUsd,
	stableToken,
	feedback,
	infoOpen,
	onInfoOpenChange,
	onTicketSizeChange,
	onSwipe,
}: {
	candidate: Candidate;
	reason: string;
	ticketSizeUsd: number;
	stableToken: "USDC";
	feedback?: DecisionFeedback;
	infoOpen: boolean;
	onInfoOpenChange: (open: boolean) => void;
	onTicketSizeChange: (ticketSizeUsd: number) => void;
	onSwipe: (add: boolean) => void;
}) {
	const pointerStart = useRef<{ id: number; x: number } | undefined>(undefined);
	const amountInput = useRef<HTMLInputElement>(null);
	const [dragX, setDragX] = useState(0);
	const [editingAmount, setEditingAmount] = useState(false);
	const [amountDraft, setAmountDraft] = useState(String(ticketSizeUsd));

	useEffect(() => {
		if (!editingAmount) setAmountDraft(String(ticketSizeUsd));
	}, [editingAmount, ticketSizeUsd]);

	useEffect(() => {
		if (!editingAmount) return;
		amountInput.current?.focus();
		amountInput.current?.select();
	}, [editingAmount]);

	function finishAmountEdit() {
		const parsed = parseCardAmountInput(amountDraft);
		if (parsed !== undefined) onTicketSizeChange(parsed);
		else setAmountDraft(String(ticketSizeUsd));
		setEditingAmount(false);
	}

	function resetDrag() {
		pointerStart.current = undefined;
		setDragX(0);
	}

	return (
		<article
			className={`swipe-card${dragX ? " is-dragging" : ""}${feedback ? ` is-${feedback}` : ""}`}
			style={{ transform: `translateX(${dragX}px) rotate(${dragX / 28}deg)` }}
			onPointerDown={(event) => {
				if (
					feedback ||
					(event.target as HTMLElement).closest("button, a, input")
				)
					return;
				pointerStart.current = { id: event.pointerId, x: event.clientX };
				event.currentTarget.setPointerCapture(event.pointerId);
			}}
			onPointerMove={(event) => {
				if (
					!pointerStart.current ||
					pointerStart.current.id !== event.pointerId
				)
					return;
				setDragX(
					Math.max(-120, Math.min(120, event.clientX - pointerStart.current.x)),
				);
			}}
			onPointerUp={(event) => {
				if (
					!pointerStart.current ||
					pointerStart.current.id !== event.pointerId
				)
					return;
				const distance = event.clientX - pointerStart.current.x;
				resetDrag();
				if (Math.abs(distance) >= SWIPE_THRESHOLD_PX) onSwipe(distance > 0);
			}}
			onPointerCancel={resetDrag}
		>
			{feedback ? (
				<div className={`card-decision-flash ${feedback}`} aria-live="polite">
					<div className="decision-confetti" aria-hidden="true">
						<i>✦</i>
						<i>✦</i>
						<i>✦</i>
					</div>
					<span>{feedback === "invest" ? "👍" : "👎"}</span>
					<b>{feedback === "invest" ? "In your basket" : "Skipped"}</b>
				</div>
			) : null}
			<div className="card-head">
				<div className="asset-title">
					<AssetMark
						assetId={candidate.assetId}
						symbol={candidate.symbol}
						iconUrl={candidate.iconUrl}
						size="lg"
						decorative
					/>
					<div>
						<h2>{candidate.symbol}</h2>
						<p>{assetDisplayName(candidate.name)}</p>
					</div>
				</div>
				{editingAmount ? (
					<div className="allocation-stamp allocation-amount-editor is-editing">
						<span aria-hidden="true">$</span>
						<input
							ref={amountInput}
							type="text"
							inputMode="decimal"
							size={Math.min(8, Math.max(3, amountDraft.length))}
							aria-label={`Card amount in ${stableToken}`}
							value={amountDraft}
							onChange={(event) => setAmountDraft(event.target.value)}
							onBlur={finishAmountEdit}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									finishAmountEdit();
								} else if (event.key === "Escape") {
									event.preventDefault();
									setAmountDraft(String(ticketSizeUsd));
									setEditingAmount(false);
								}
							}}
						/>
						<WandSparkles aria-hidden="true" />
					</div>
				) : (
					<button
						type="button"
						className="allocation-stamp allocation-amount-editor"
						onClick={() => setEditingAmount(true)}
						aria-label={`Edit card amount, currently ${ticketSizeUsd} dollars`}
					>
						<span aria-hidden="true">$</span>
						<strong>{ticketSizeUsd}</strong>
						<WandSparkles aria-hidden="true" />
					</button>
				)}
			</div>
			<PriceSparkline
				key={candidate.assetId}
				candidate={candidate}
				reason={reason}
				infoOpen={infoOpen}
				onInfoOpenChange={onInfoOpenChange}
			/>
		</article>
	);
}
