import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	executionSummary,
	failedExecutionSelections,
	ReceiptScreen,
} from "./ReceiptScreen";

describe("receipt semantics", () => {
	it("uses a current empty-receipt state instead of the removed Activity tab", () => {
		const html = renderToStaticMarkup(
			<ReceiptScreen
				selected={[]}
				demoMode={false}
				onResume={async () => {}}
				onViewPortfolio={() => {}}
				onStartNextBasket={() => {}}
			/>,
		);

		expect(html).toContain("No receipt yet");
		expect(html).toContain("Start a basket");
		expect(html).not.toContain("Activity");
	});

	it("describes atomic and independent settlement without conflating them", () => {
		expect(
			executionSummary({
				demoMode: false,
				submissionMode: "BATCH",
				providerLabel: "Jupiter",
				swapCount: 5,
				transactionCount: 1,
			}),
		).toBe("One atomic Jupiter transaction · 5 swaps");
		expect(
			executionSummary({
				demoMode: false,
				submissionMode: "SEQUENTIAL",
				providerLabel: "Jupiter",
				swapCount: 5,
				transactionCount: 3,
			}),
		).toBe("3 independent Jupiter transactions · 5 swaps");
	});

	it("retries only definitively failed legs and preserves their quoted amount", () => {
		const record = {
			plan: {
				quotes: [
					{ assetId: "failed", amountInBaseUnits: "100000" },
					{ assetId: "unknown", amountInBaseUnits: "200000" },
				],
			},
			legs: [
				{ status: "FAILED", assetIds: ["failed"], amountInBaseUnits: "100000" },
				{ status: "UNKNOWN", assetIds: ["unknown"], amountInBaseUnits: "200000" },
			],
		} as Parameters<typeof failedExecutionSelections>[0];

		expect(failedExecutionSelections(record)).toEqual([
			{ assetId: "failed", amountInBaseUnits: "100000" },
		]);
	});
});
