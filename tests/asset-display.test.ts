import { describe, expect, it } from "vitest";
import { assetDisplayName } from "../src/domain/asset-display.js";

describe("assetDisplayName", () => {
	it("removes provider branding wherever it appears", () => {
		expect(assetDisplayName("AMD xStock")).toBe("AMD");
		expect(assetDisplayName("xStocks Apple")).toBe("Apple");
		expect(assetDisplayName("NVIDIA (xStock)")).toBe("NVIDIA");
	});

	it("keeps a usable fallback for a provider-only name", () => {
		expect(assetDisplayName("xStock")).toBe("Token");
	});
});
