import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BudgetSummary } from "./BudgetRail";

describe("budget period copy", () => {
	it("uses the configured cadence instead of always saying month", () => {
		const weekly = renderToStaticMarkup(
			<BudgetSummary
				selectedCount={1}
				ticketSizeUsd={0.1}
				periodLimitUsd={50}
				cadence="weekly"
			/>,
		);
		expect(weekly).toContain("This week limit:");
		expect(weekly).toContain('aria-label="This week budget left"');
		expect(weekly).not.toContain("This month limit:");
	});
});
