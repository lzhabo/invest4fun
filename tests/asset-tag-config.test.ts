import { describe, expect, it } from "vitest";
import { visibleAssetTags } from "../src/domain/asset-tag-config.js";

describe("asset tag config", () => {
	it("hides configured categories and keeps unrelated tags", () => {
		expect(
			visibleAssetTags([
				"Cat-Themed",
				"4chan-Themed",
				"Animal",
				"Dog",
				"Hidden Chain Stocks Ecosystem",
				"FTX Holdings",
				"Alameda Research Portfolio",
				"Fruits",
				"Example Ecosystem",
			]),
		).toEqual([
			{
				label: "Example Ecosystem",
				source: "Example Ecosystem",
				tone: "default",
			},
		]);
	});

	it("moves Tokenized Stock first and assigns the configured colors", () => {
		expect(
			visibleAssetTags(["Meme", "Solana Ecosystem", "Tokenized Stock"]),
		).toEqual([
			{
				label: "Tokenized Stock",
				source: "Tokenized Stock",
				tone: "tokenized-stock",
			},
			{ label: "Meme", source: "Meme", tone: "meme" },
			{ label: "Solana", source: "Solana Ecosystem", tone: "default" },
		]);
	});
});
