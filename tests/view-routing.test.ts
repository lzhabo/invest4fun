import { describe, expect, it } from "vitest";
import {
	isPublicPrimaryView,
	pathForPrimaryView,
	primaryViewFromPathname,
	shouldShowPublicFeedPreview,
} from "../src/client/view-routing.js";

describe("primary view routing", () => {
	it.each([
		["week", "/feed"],
		["builder", "/builder"],
		["ideas", "/ideas"],
		["market", "/market"],
		["positions", "/portfolio"],
		["settings", "/settings"],
	] as const)("maps %s to %s", (view, path) => {
		expect(pathForPrimaryView(view)).toBe(path);
		expect(primaryViewFromPathname(path)).toBe(view);
	});

	it("treats the root URL as Feed and accepts a trailing slash", () => {
		expect(primaryViewFromPathname("/")).toBe("week");
		expect(primaryViewFromPathname("/portfolio/")).toBe("positions");
	});

	it("rejects unknown product pages", () => {
		expect(primaryViewFromPathname("/activity")).toBeUndefined();
	});

	it("keeps browsing routes public and wallet-specific routes private", () => {
		expect(
			(["week", "ideas", "builder", "market"] as const).every(
				isPublicPrimaryView,
			),
		).toBe(true);
		expect(isPublicPrimaryView("positions")).toBe(false);
		expect(isPublicPrimaryView("settings")).toBe(false);
	});

	it("keeps the old Account URL as a Settings alias", () => {
		expect(primaryViewFromPathname("/account")).toBe("settings");
	});

	it("shows the public Feed preview only before sign-in", () => {
		expect(shouldShowPublicFeedPreview("week", false)).toBe(true);
		expect(shouldShowPublicFeedPreview("week", true)).toBe(false);
		expect(shouldShowPublicFeedPreview("positions", false)).toBe(false);
	});
});
