import { CircleHelp, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
	BundleDefinition,
	ResolvedBundleHolding,
} from "../../domain/ideas";
import { highestWeightBundleHolding } from "../../domain/ideas";
import type { AssetHistoryResponse, HistoryPeriod } from "../api";
import { parseCardAmountInput } from "../card-amount";
import { chartPointsFromPrices } from "../chart-animation";
import { chartDateLabels, chartPriceTicks } from "../chart-history";
import { formatChartAxisUsdPrice } from "../price-format";
import { weightedBundleHistory } from "../weighted-bundle-history";
import { AssetMark } from "./AssetMark";
import { ChartLoading, ChartShape } from "./SwipeCard";

const SWIPE_THRESHOLD_PX = 72;
const HISTORY_PERIODS: HistoryPeriod[] = ["1W", "1M", "3M", "1Y", "ALL"];

export function IdeaSwipeCard({
	bundle,
	holdings,
	amountCents,
	onAmountChange,
	feedback,
	infoOpen,
	onInfoOpenChange,
	onSwipe,
	loading,
	routesChecked,
}: {
	bundle: BundleDefinition;
	holdings: ResolvedBundleHolding[];
	amountCents: number;
	onAmountChange: (amountCents: number) => void;
	feedback?: "invest" | "skip";
	infoOpen: boolean;
	onInfoOpenChange: (open: boolean) => void;
	onSwipe: (add: boolean) => void;
	loading: boolean;
	routesChecked: boolean;
}) {
	const pointerStart = useRef<{ id: number; x: number } | undefined>(undefined);
	const amountInput = useRef<HTMLInputElement>(null);
	const [dragX, setDragX] = useState(0);
	const [editingAmount, setEditingAmount] = useState(false);
	const [amountDraft, setAmountDraft] = useState(String(amountCents / 100));
	const [period, setPeriod] = useState<HistoryPeriod>("3M");
	const [history, setHistory] = useState<AssetHistoryResponse>();

	useEffect(() => {
		if (!editingAmount) setAmountDraft(String(amountCents / 100));
	}, [amountCents, editingAmount]);

	useEffect(() => {
		if (!editingAmount) return;
		amountInput.current?.focus();
		amountInput.current?.select();
	}, [editingAmount]);

	useEffect(() => {
		let active = true;
		setHistory(undefined);
		void weightedBundleHistory(bundle.holdings, period).then((result) => {
			if (active) setHistory(result);
		});
		return () => {
			active = false;
		};
	}, [bundle, period]);

	const chart = useMemo(() => {
		const prices = history?.points.map((point) => point.price) ?? [];
		const first = prices[0];
		const last = prices.at(-1);
		return {
			prices,
			points: chartPointsFromPrices(prices),
			priceTicks: chartPriceTicks(prices),
			dates: chartDateLabels(history),
			change: first && last ? ((last - first) / first) * 100 : 0,
		};
	}, [history]);
	const hasRealHistory = Boolean(
		history && history.source !== "unavailable" && chart.prices.length >= 2,
	);
	const primaryHolding = highestWeightBundleHolding(bundle);
	const primary = holdings.find(
		(holding) => holding.candidate.assetId === primaryHolding?.assetId,
	)?.candidate;

	function finishAmountEdit() {
		const parsed = parseCardAmountInput(amountDraft);
		if (parsed !== undefined) onAmountChange(Math.round(parsed * 100));
		else setAmountDraft(String(amountCents / 100));
		setEditingAmount(false);
	}

	if (loading) {
		return (
			<article
				className="swipe-card idea-swipe-card idea-card-loading"
				aria-busy="true"
			>
				<ChartLoading label={`Checking ${bundle.title} routes`} />
			</article>
		);
	}

	return (
		<article
			className={`swipe-card idea-swipe-card${dragX ? " is-dragging" : ""}${feedback ? ` is-${feedback}` : ""}`}
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
				if (pointerStart.current?.id !== event.pointerId) return;
				setDragX(
					Math.max(-120, Math.min(120, event.clientX - pointerStart.current.x)),
				);
			}}
			onPointerUp={(event) => {
				if (pointerStart.current?.id !== event.pointerId) return;
				const distance = event.clientX - pointerStart.current.x;
				pointerStart.current = undefined;
				setDragX(0);
				if (Math.abs(distance) >= SWIPE_THRESHOLD_PX) onSwipe(distance > 0);
			}}
			onPointerCancel={() => {
				pointerStart.current = undefined;
				setDragX(0);
			}}
		>
			{feedback ? (
				<div className={`card-decision-flash ${feedback}`} aria-live="polite">
					<b>{feedback === "invest" ? "Bundle added" : "Skipped"}</b>
				</div>
			) : null}
			<div className="card-head idea-card-head">
				<div className="asset-title">
					<AssetMark
						symbol={primary?.symbol ?? primaryHolding?.symbol ?? bundle.title}
						iconUrl={primary?.iconUrl ?? primaryHolding?.iconUrl}
						size="lg"
						decorative
					/>
					<div>
						<h2>{bundle.title}</h2>
						<p>{bundle.subtitle}</p>
					</div>
				</div>
				{editingAmount ? (
					<div className="allocation-stamp idea-amount-stamp">
						<span aria-hidden="true">USDC</span>
						<input
							ref={amountInput}
							type="text"
							inputMode="decimal"
							aria-label="Bundle amount in USDC"
							value={amountDraft}
							onChange={(event) => setAmountDraft(event.target.value)}
							onBlur={finishAmountEdit}
							onKeyDown={(event) => {
								if (event.key === "Enter") finishAmountEdit();
								if (event.key === "Escape") setEditingAmount(false);
							}}
						/>
						<WandSparkles aria-hidden="true" />
					</div>
				) : (
					<button
						type="button"
						className="allocation-stamp idea-amount-stamp"
						onClick={() => setEditingAmount(true)}
						aria-label={`Edit bundle amount, currently ${amountCents / 100} dollars`}
					>
						<span>USDC</span>
						<strong>{amountCents / 100}</strong>
						<WandSparkles aria-hidden="true" />
					</button>
				)}
			</div>
			<div
				className={`price-chart bundle-chart${chart.change < 0 ? " is-down" : ""}${infoOpen ? " has-info" : ""}`}
			>
				<div className="chart-meta idea-chart-meta">
					<div className="idea-chart-legend">
						<span className="strategy">
							<i />
							Portfolio
						</span>
					</div>
					<span>
						{chart.prices.length
							? `${chart.change >= 0 ? "+" : ""}${chart.change.toFixed(2)}% · ${period}`
							: `— · ${period}`}
					</span>
				</div>
				{history ? (
					hasRealHistory ? (
						<>
							<div className="chart-plot">
								<ChartShape
									points={chart.points}
									label={`${bundle.title} ${period} hypothetical historical chart`}
								/>
								<div className="chart-prices" aria-hidden="true">
									{[5, 12.67, 20.33, 28].map((y, index) => (
										<span style={{ top: `${(y / 32) * 100}%` }} key={y}>
											{formatChartAxisUsdPrice(chart.priceTicks[index] ?? 0)}
										</span>
									))}
								</div>
							</div>
							{chart.dates.length ? (
								<div className="chart-dates">
									<span>{chart.dates[0]}</span>
									<span>{chart.dates[1]}</span>
								</div>
							) : null}
						</>
					) : (
						<p className="chart-unavailable">
							Historical comparison is unavailable for this basket.
						</p>
					)
				) : (
					<ChartLoading label={`Loading ${period} bundle history`} />
				)}
				<div className="chart-controls">
					<fieldset className="chart-timeframes">
						<legend className="sr-only">Chart timeframe</legend>
						{HISTORY_PERIODS.map((option) => (
							<button
								type="button"
								aria-pressed={period === option}
								onClick={() => setPeriod(option)}
								key={option}
							>
								{option === "ALL" ? "All" : option}
							</button>
						))}
					</fieldset>
					<button
						type="button"
						className="chart-reason-toggle"
						aria-label={
							infoOpen ? "Hide bundle information" : "Show bundle information"
						}
						aria-expanded={infoOpen}
						onClick={() => onInfoOpenChange(!infoOpen)}
					>
						<CircleHelp aria-hidden="true" />
					</button>
				</div>
				<div
					className={`bundle-allocation ${infoOpen ? "is-expanded" : "is-compact"}`}
				>
					<p className="bundle-description">{bundle.description}</p>
					{infoOpen ? <p className="bundle-details">{bundle.details}</p> : null}
					<div
						className="bundle-composition-bar"
						role="img"
						aria-label="Bundle allocation: 100 percent"
					>
						{bundle.holdings.map((holding) => (
							<i
								key={holding.assetId}
								style={{ width: `${holding.weightBps / 100}%` }}
								title={`${holding.symbol} ${holding.weightBps / 100}%`}
							/>
						))}
					</div>
					{infoOpen ? (
						<div className="bundle-holdings-grid">
							{bundle.holdings.map((holding) => (
								<div className="bundle-holding" key={holding.assetId}>
									<AssetMark
										symbol={holding.symbol}
										iconUrl={holding.iconUrl}
										size="sm"
										decorative
									/>
									<strong title={holding.name}>{holding.symbol}</strong>
									<b>
										{(holding.weightBps / 100).toFixed(
											holding.weightBps % 100 ? 1 : 0,
										)}
										%
									</b>
								</div>
							))}
						</div>
					) : null}
					{routesChecked && !holdings.length ? (
						<p>
							No executable holdings are available for this preset right now.
						</p>
					) : null}
					{hasRealHistory ? (
						<small>
							Hypothetical historical comparison. Past performance does not
							predict future results.
						</small>
					) : null}
				</div>
			</div>
		</article>
	);
}
