import { describe, expect, it } from "vitest";
import { reviewInteractionsLocked } from "../src/client/review-interaction-lock.js";

describe("review interaction lock", () => {
	it.each(["refreshing", "simulating", "signing", "settling"] as const)(
		"locks basket mutations while %s",
		(phase) => {
			expect(
				reviewInteractionsLocked({ phase, hasPreparedExecution: false }),
			).toBe(true);
		},
	);

	it("keeps inline mutations locked after quotes are prepared", () => {
		expect(
			reviewInteractionsLocked({
				phase: "idle",
				hasPreparedExecution: true,
			}),
		).toBe(true);
	});

	it("allows editing only before preparation", () => {
		expect(
			reviewInteractionsLocked({
				phase: "idle",
				hasPreparedExecution: false,
			}),
		).toBe(false);
	});
});
