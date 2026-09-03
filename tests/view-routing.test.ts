import { describe, expect, it } from "vitest";
import {
	pathForPrimaryView,
	primaryViewFromPathname,
} from "../src/client/view-routing.js";

describe("primary view routing", () => {
	it.each([
		["week", "/feed"],
		["builder", "/builder"],
		["ideas", "/ideas"],
		["market", "/market"],
		["positions", "/portfolio"],
		["account", "/account"],
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
});
