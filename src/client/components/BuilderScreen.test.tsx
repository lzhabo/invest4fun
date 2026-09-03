import { describe, expect, it } from "vitest";
import {
	builderPerformanceChart,
	builderReviewBlocker,
	formatUsdcInput,
	formatPerformancePercent,
	friendlyGenerationError,
	parseUsdcInput,
	shouldSubmitBuilderPromptOnKeyDown,
} from "./BuilderScreen";

describe("Builder interaction safety", () => {
	it("turns model validation codes into useful recovery copy", () => {
		expect(
			friendlyGenerationError(new Error("STRATEGY_WEIGHTS_INVALID")),
		).toContain("previous draft is unchanged");
	});

	it("submits Enter but preserves Shift+Enter and IME composition", () => {
		expect(
			shouldSubmitBuilderPromptOnKeyDown({
				key: "Enter",
				shiftKey: false,
				isComposing: false,
			}),
		).toBe(true);
		expect(
			shouldSubmitBuilderPromptOnKeyDown({
				key: "Enter",
				shiftKey: true,
				isComposing: false,
			}),
		).toBe(false);
		expect(
			shouldSubmitBuilderPromptOnKeyDown({
				key: "Enter",
				shiftKey: false,
				isComposing: true,
			}),
		).toBe(false);
	});

	it("edits USDC totals as text and converts them to exact integer cents", () => {
		expect(parseUsdcInput("3.04")).toBe(304);
		expect(parseUsdcInput("3,04")).toBe(304);
		expect(parseUsdcInput("10.")).toBe(1_000);
		expect(parseUsdcInput("")).toBeUndefined();
		expect(parseUsdcInput("0.09")).toBeUndefined();
		expect(parseUsdcInput("1.234")).toBeUndefined();
		expect(formatUsdcInput(304)).toBe("3.04");
	});

	it("blocks review for stale checks and every reported preflight issue", () => {
		const now = Date.now();
		expect(
			builderReviewBlocker({
				hasPortfolio: true,
				checking: false,
				generating: false,
				now,
				preflight: {
					candidates: [],
					issues: [],
					checkedAt: new Date(now - 20_000).toISOString(),
					expiresAt: new Date(now - 1).toISOString(),
				},
			}),
		).toMatch(/stale/i);
		for (const message of [
			"Route unavailable",
			"Minimum order not met",
			"Insufficient wallet balance",
			"Balance check failed",
		]) {
			expect(
				builderReviewBlocker({
					hasPortfolio: true,
					checking: false,
					generating: false,
					now,
					preflight: {
						candidates: [],
						issues: [{ code: "BLOCKED", message }],
						checkedAt: new Date(now).toISOString(),
						expiresAt: new Date(now + 30_000).toISOString(),
					},
				}),
			).toBe(message);
		}
	});

	it("builds numeric portfolio and S&P 500 comparison values", () => {
		const chart = builderPerformanceChart({
			period: "1M",
			source: "yahoo",
			points: [
				{ timestamp: 1_725_235_200, price: 100 },
				{ timestamp: 1_727_827_200, price: 90 },
				{ timestamp: 1_730_419_200, price: 110 },
			],
			benchmarkPoints: [
				{ timestamp: 1_725_235_200, price: 100 },
				{ timestamp: 1_730_419_200, price: 95 },
			],
		});

		expect(chart?.portfolioReturn).toBeCloseTo(10);
		expect(chart?.benchmarkReturn).toBeCloseTo(-5);
		expect(chart?.maxDrawdown).toBeCloseTo(-10);
		expect(chart?.priceTicks).toEqual([110, 103.3333333333, 96.6666666667, 90]);
		expect(chart?.portfolioPoints).toHaveLength(80);
		expect(chart?.benchmarkPoints).toHaveLength(80);
		expect(chart?.startDate).toBeTruthy();
		expect(chart?.endDate).toBeTruthy();
		expect(formatPerformancePercent(10)).toBe("+10.0%");
		expect(formatPerformancePercent(-5)).toBe("-5.0%");
	});

	it("does not render a comparison without a valid real benchmark series", () => {
		expect(
			builderPerformanceChart({
				period: "1M",
				source: "yahoo",
				points: [
					{ timestamp: 1, price: 100 },
					{ timestamp: 2, price: 102 },
				],
			}),
		).toBeUndefined();
	});
});
