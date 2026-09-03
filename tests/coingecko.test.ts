import { describe, expect, it, vi } from "vitest";
import type { RegistryAsset } from "../src/domain/constants.js";
import {
	CoinGeckoIconProvider,
} from "../src/server/adapters/coingecko.js";

const sol: RegistryAsset = {
	assetId: "sol:mainnet:SOL",
	symbol: "SOL",
	name: "Solana",
	kind: "CRYPTO",
	address: "So11111111111111111111111111111111111111112",
	decimals: 9,
	coingeckoId: "solana",
};

const goldMiners: RegistryAsset = {
	assetId: "sol:mainnet:GDXx",
	symbol: "GDXx",
	name: "VanEck Gold Miners xStock",
	kind: "STOCK_TOKEN",
	address: "GDXx",
	decimals: 8,
};

describe("CoinGecko Solana market-data adapter", () => {
	it("loads icons only from the Solana runtime registry", async () => {
		const fetcher = vi.fn(async (input: string | URL | Request) => {
			const url = String(input);
			expect(url).toContain("ids=");
			expect(url).toContain("solana");
			return new Response(
				JSON.stringify([
					{ id: "solana", image: "https://example.com/sol.png" },
				]),
				{ status: 200 },
			);
		});
		const provider = new CoinGeckoIconProvider(undefined, fetcher as typeof fetch);

		await expect(provider.getIcons()).resolves.toMatchObject({
			SOL: "https://example.com/sol.png",
		});
	});

	it("loads Solana price history through the coin interface", async () => {
		const fetcher = vi.fn(async (input: string | URL | Request) => {
			const url = String(input);
			expect(url).toContain("/coins/solana/market_chart");
			return new Response(
				JSON.stringify({ prices: [[1_700_000_000_000, 100], [1_700_000_060_000, 101]] }),
				{ status: 200 },
			);
		});
		const provider = new CoinGeckoIconProvider(undefined, fetcher as typeof fetch);

		await expect(provider.history(sol, "1D")).resolves.toMatchObject({
			source: "coingecko",
			sourceAsset: "solana",
			points: [
				{ timestamp: 1_700_000_000, price: 100 },
				{ timestamp: 1_700_000_060, price: 101 },
			],
		});
	});

	it("loads xStock history with its underlying market symbol", async () => {
		const fetcher = vi.fn(async (input: string | URL | Request) => {
			const url = String(input);
			if (url.includes("query1.finance.yahoo.com")) {
				expect(url).toContain("/GDX?");
				return new Response("rate limited", { status: 429 });
			}
			if (url.includes("assetclass=stocks")) {
				expect(url).toContain("/GDX/historical?");
				return Response.json({ data: null });
			}
			expect(url).toContain("/GDX/historical?");
			expect(url).toContain("assetclass=etf");
			return Response.json({
				data: {
					tradesTable: {
						rows: [
							{ date: "08/01/2026", close: "$72.00" },
							{ date: "09/01/2026", close: "$81.00" },
						],
					},
				},
			});
		});
		const provider = new CoinGeckoIconProvider(undefined, fetcher as typeof fetch);

		await expect(provider.history(goldMiners, "1M")).resolves.toMatchObject({
			source: "nasdaq",
			sourceAsset: "GDX",
			points: [
				{ timestamp: 1_785_542_400, price: 72 },
				{ timestamp: 1_788_220_800, price: 81 },
			],
		});
		await expect(provider.history(goldMiners, "3M")).resolves.toMatchObject({
			source: "nasdaq",
			sourceAsset: "GDX",
		});
	});

	it("uses only Solana on-chain token info for details", async () => {
		const fetcher = vi.fn(async (input: string | URL | Request) => {
			const url = String(input);
			if (url.includes("/onchain/networks/solana/")) {
				return new Response(
					JSON.stringify({ data: { attributes: { categories: ["Layer 1"] } } }),
					{ status: 200 },
				);
			}
			return new Response(
				JSON.stringify({ id: "solana", categories: ["Smart Contract Platform"] }),
				{ status: 200 },
			);
		});
		const provider = new CoinGeckoIconProvider(undefined, fetcher as typeof fetch);

		await expect(provider.details(sol)).resolves.toMatchObject({
			source: "coingecko",
			coingeckoId: "solana",
			categories: ["Smart Contract Platform", "Layer 1"],
		});
	});
});
