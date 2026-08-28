import type { HistoryPeriod } from "./api.js";

export const INITIAL_CHART_PERIOD: HistoryPeriod = "1M";

export function chartPrefetchRequests({
	visibleAssetId,
	nextAssetId,
}: {
	visibleAssetId?: string;
	nextAssetId?: string;
}) {
	return [visibleAssetId, nextAssetId]
		.filter(
			(assetId, index, assetIds): assetId is string =>
				Boolean(assetId) && assetIds.indexOf(assetId) === index,
		)
		.map((assetId) => ({ assetId, period: INITIAL_CHART_PERIOD }));
}
