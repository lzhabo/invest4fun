import { describe, expect, it } from "vitest";
import { resolveAppEntryView } from "../src/client/app-entry-route.js";

describe("resolveAppEntryView", () => {
	it("keeps the onboarding visible for signed-out visitors", () => {
		expect(
			resolveAppEntryView({
				stage: "onboarding",
				authenticated: false,
				hasEmbeddedWallet: false,
				hasFeed: false,
			}),
		).toBe("ONBOARDING");
	});

	it("keeps returning users on a skeleton until routing data is resolved", () => {
		expect(
			resolveAppEntryView({
				stage: "loading",
				authenticated: true,
				hasEmbeddedWallet: true,
				hasFeed: false,
			}),
		).toBe("SKELETON");
	});

	it("asks only authenticated users with no embedded wallet to connect", () => {
		expect(
			resolveAppEntryView({
				stage: "swipe",
				authenticated: true,
				hasEmbeddedWallet: false,
				hasFeed: false,
			}),
		).toBe("WALLET_REQUIRED");
	});

	it("renders the app only after its route has been resolved", () => {
		expect(
			resolveAppEntryView({
				stage: "swipe",
				authenticated: true,
				hasEmbeddedWallet: true,
				hasFeed: true,
			}),
		).toBe("APP");
	});
});
