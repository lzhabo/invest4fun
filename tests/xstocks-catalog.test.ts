import { expect, it, vi } from "vitest";
import { XStocksCatalogService } from "../src/server/adapters/xstocks-catalog.js";

it("maps active Solana xStocks from the official catalog", async () => {
	const fetcher = vi.fn().mockResolvedValue(
		new Response(
			JSON.stringify({
				nodes: [
					{
						name: "Novo Nordisk xStock",
						symbol: "NVOx",
						isTradingHalted: false,
						deployments: [{ network: "Solana", address: "svm:NVO_MINT" }],
					},
					{
						name: "Halted xStock",
						symbol: "HALTx",
						isTradingHalted: true,
						deployments: [{ network: "Solana", address: "svm:HALT_MINT" }],
					},
				],
			}),
			{ status: 200 },
		),
	);

	const assets = await new XStocksCatalogService(fetcher).assets();

	expect(assets).toEqual([
		{
			assetId: "sol:mainnet:NVO_MINT",
			symbol: "NVOx",
			name: "Novo Nordisk",
			kind: "STOCK_TOKEN",
			category: "STOCK",
			address: "NVO_MINT",
			decimals: 8,
		},
	]);
	expect(fetcher).toHaveBeenCalledOnce();
});
