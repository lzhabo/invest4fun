import type { AssetHistoryResponse, HistoryPeriod } from "./api.js";
import { api } from "./api.js";

const REAL_HISTORY_SOURCES = new Set(["coingecko", "nasdaq", "yahoo"]);

export async function weightedBundleHistory(
	holdings: Array<{ assetId: string; weightBps: number }>,
	period: HistoryPeriod,
): Promise<AssetHistoryResponse> {
	const histories = await Promise.all(
		holdings.map((holding) =>
			api.assetHistory(holding.assetId, period).catch(() => ({
				period,
				source: "unavailable" as const,
				points: [],
			})),
		),
	);
	const usable = histories.flatMap((history, index) => {
		const holding = holdings[index];
		return holding &&
			REAL_HISTORY_SOURCES.has(history.source) &&
			history.points.length >= 2 &&
			history.points.every(
				(point) => Number.isFinite(point.price) && point.price > 0,
			)
			? [{ history, holding }]
			: [];
	});
	if (usable.length !== holdings.length || !usable.length) {
		return { period, source: "unavailable", points: [] };
	}
	const length = Math.min(
		80,
		...usable.map(({ history }) => history.points.length),
	);
	const first = usable[0];
	if (!first) return { period, source: "unavailable", points: [] };
	const points = Array.from({ length }, (_, pointIndex) => {
		const progress = pointIndex / Math.max(1, length - 1);
		let weightedIndex = 0;
		let totalWeight = 0;
		for (const { history, holding } of usable) {
			const initial = history.points[0]?.price;
			const current =
				history.points[Math.round(progress * (history.points.length - 1))];
			if (!initial || !current) continue;
			weightedIndex += (current.price / initial) * holding.weightBps;
			totalWeight += holding.weightBps;
		}
		return {
			timestamp:
				first.history.points[
					Math.round(progress * (first.history.points.length - 1))
				]?.timestamp ?? 0,
			price: totalWeight ? (weightedIndex / totalWeight) * 100 : 100,
		};
	});
	return { period, source: "coingecko", points };
}
