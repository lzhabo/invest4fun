import { describe, expect, it, vi } from "vitest";
import { checkFundingWithin } from "../src/client/funding-check.js";

describe("checkFundingWithin", () => {
	it("returns an unavailable route decision and aborts a slow balance read", async () => {
		vi.useFakeTimers();
		let aborted = false;
		const result = checkFundingWithin(
			(signal) =>
				new Promise<string>((_resolve, reject) => {
					signal.addEventListener("abort", () => {
						aborted = true;
						reject(new DOMException("Aborted", "AbortError"));
					});
				}),
			5_000,
		);

		await vi.advanceTimersByTimeAsync(5_000);
		await expect(result).resolves.toEqual({ status: "unavailable" });
		expect(aborted).toBe(true);
		vi.useRealTimers();
	});

	it("returns a resolved balance before the timeout", async () => {
		await expect(
			checkFundingWithin(async () => "READY", 5_000),
		).resolves.toEqual({ status: "resolved", value: "READY" });
	});
});
