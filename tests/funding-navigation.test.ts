import { describe, expect, it } from "vitest";
import { stageAfterPrimaryNavigation } from "../src/client/funding-navigation.js";

describe("funding navigation", () => {
	it("gates Feed but lets Portfolio and Account render normally", () => {
		for (const target of ["positions", "account"] as const) {
			expect(
				stageAfterPrimaryNavigation({
					currentStage: "funding",
					target,
					fundingActive: true,
					hasFeed: false,
				}),
			).toBe("swipe");
		}
		expect(
			stageAfterPrimaryNavigation({
				currentStage: "swipe",
				target: "week",
				fundingActive: true,
				hasFeed: false,
			}),
		).toBe("funding");
	});
});
