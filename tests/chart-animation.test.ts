import { describe, expect, it } from "vitest";
import {
	chartPointsAttribute,
	chartPointsFromPrices,
	interpolateChartPoints,
} from "../src/client/chart-animation.js";

describe("chart timeframe animation", () => {
	it("normalizes multi-point histories to a stable shape", () => {
		const points = chartPointsFromPrices([10, 20, 15]);

		expect(points).toHaveLength(80);
		expect(points[0]).toEqual({ x: 0, y: 28 });
		expect(points.at(-1)?.x).toBe(100);
		expect(chartPointsAttribute(points)).toMatch(/^0\.00,28\.00 /);
	});

	it("interpolates every point between timeframe shapes", () => {
		const from = [
			{ x: 0, y: 28 },
			{ x: 100, y: 5 },
		];
		const to = [
			{ x: 0, y: 5 },
			{ x: 100, y: 28 },
		];

		expect(interpolateChartPoints(from, to, 0.5)).toEqual([
			{ x: 0, y: 16.5 },
			{ x: 100, y: 16.5 },
		]);
		expect(interpolateChartPoints(from, to, 2)).toEqual(to);
	});

	it("uses one domain to compare a strategy with its benchmark", () => {
		const domain = { min: 90, max: 120 };
		const strategy = chartPointsFromPrices([100, 120], domain);
		const benchmark = chartPointsFromPrices([100, 110], domain);

		expect(strategy.at(-1)?.y).toBe(5);
		expect(benchmark.at(-1)?.y).toBeGreaterThan(12);
		expect(benchmark.at(-1)?.y).toBeLessThan(13);
	});
});
