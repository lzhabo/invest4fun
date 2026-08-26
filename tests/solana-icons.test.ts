import { describe, expect, it } from "vitest";
import { solanaAssetIconUrl } from "../src/domain/solana.js";

describe("Solana asset icons", () => {
	it("uses Backed metadata logos for xStocks", () => {
		expect(solanaAssetIconUrl("SPYx", "https://jupiter.example/spy.png")).toBe(
			"https://xstocks-metadata.backed.fi/logos/tokens/SPYx.png",
		);
	});

	it("keeps the provider icon for non-xStock Solana assets", () => {
		expect(
			solanaAssetIconUrl("SPCX", "https://backpack.example/spcx.png"),
		).toBe("https://backpack.example/spcx.png");
	});
});
