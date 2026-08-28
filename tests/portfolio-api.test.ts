import request from "supertest";
import { describe, expect, it } from "vitest";
import { SOLANA_USDC_MINT } from "../src/domain/solana.js";
import { DeterministicRanker } from "../src/server/adapters/deterministic-ranker.js";
import {
	SolanaDemoCandidateProvider,
	SolanaDemoExecutionProvider,
} from "../src/server/adapters/solana-demo.js";
import { createApp } from "../src/server/app.js";
import { loadConfig } from "../src/server/config.js";
import { portfolioMetadataCacheKey } from "../src/server/portfolio-metadata.js";
import { MemoryStateStore } from "../src/server/store.js";

describe("Solana portfolio API", () => {
	it("normalizes USDC metadata and its fixed-dollar price when Alchemy omits both", async () => {
		const candidates = new SolanaDemoCandidateProvider();
		const execution = new SolanaDemoExecutionProvider("JUPITER");
		const app = createApp({
			config: loadConfig({
				NODE_ENV: "test",
				INVESTMADE_DEMO_MODE: "true",
				PUBLIC_ORIGIN: "http://localhost:5173",
				SESSION_SECRET: "test-secret-that-is-at-least-32-characters",
				PRIVY_APP_ID: "test-privy-app-id",
				PRIVY_APP_SECRET: "test-privy-app-secret",
				SOLANA_RPC_URL: "https://solana-mainnet.g.alchemy.com/v2/test-key",
			}),
			store: new MemoryStateStore(),
			candidates,
			solanaCandidateProviders: { JUPITER: candidates },
			inference: new DeterministicRanker(),
			execution,
			solanaExecutionProviders: { JUPITER: execution },
			fetcher: async () =>
				new Response(
					JSON.stringify({
						data: {
							tokens: [
								{
									tokenAddress: SOLANA_USDC_MINT,
									tokenBalance: "0xdbbcf",
								},
							],
						},
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
		});

		const response = await request(app)
			.get("/api/portfolio/4JFKA5smQXNHvDWiikRwnk5zCTBsN6vYiTfzAP9zPvSp/solana")
			.expect(200);

		expect(response.body.tokens).toEqual([
			{
				assetId: "sol:mainnet:USDC",
				mint: SOLANA_USDC_MINT,
				symbol: "USDC",
				name: "USD Coin",
				decimals: 6,
				balanceBaseUnits: "900047",
				priceUsd: 1,
				explorerUrl: `https://solscan.io/token/${SOLANA_USDC_MINT}`,
				iconUrls: [],
			},
		]);
	});

	it("uses persisted purchase metadata when Alchemy omits a dynamic token identity", async () => {
		const mint = "CTPoyCwkjMvoJwU4xvZZqoD8tiYk6yDchySiN5gGpump";
		const store = new MemoryStateStore();
		await store.setProviderSnapshot(
			portfolioMetadataCacheKey(mint),
			"execution",
			{
				assetId: `sol:mainnet:${mint}`,
				mint,
				symbol: "HYPE",
				name: "Hyperliquid",
				decimals: 6,
				iconUrl: "https://example.com/hype.png",
			},
			"2036-01-01T00:00:00.000Z",
		);
		const candidates = new SolanaDemoCandidateProvider();
		const execution = new SolanaDemoExecutionProvider("JUPITER");
		const app = createApp({
			config: loadConfig({
				NODE_ENV: "test",
				INVESTMADE_DEMO_MODE: "true",
				PUBLIC_ORIGIN: "http://localhost:5173",
				SESSION_SECRET: "test-secret-that-is-at-least-32-characters",
				PRIVY_APP_ID: "test-privy-app-id",
				PRIVY_APP_SECRET: "test-privy-app-secret",
				SOLANA_RPC_URL: "https://solana-mainnet.g.alchemy.com/v2/test-key",
			}),
			store,
			candidates,
			solanaCandidateProviders: { JUPITER: candidates },
			inference: new DeterministicRanker(),
			execution,
			solanaExecutionProviders: { JUPITER: execution },
			fetcher: async () =>
				new Response(
					JSON.stringify({
						data: {
							tokens: [{ tokenAddress: mint, tokenBalance: "0x127f15" }],
						},
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
		});

		const response = await request(app)
			.get("/api/portfolio/4JFKA5smQXNHvDWiikRwnk5zCTBsN6vYiTfzAP9zPvSp/solana")
			.expect(200);

		expect(response.body.tokens[0]).toMatchObject({
			assetId: `sol:mainnet:${mint}`,
			mint,
			symbol: "HYPE",
			name: "Hyperliquid",
			decimals: 6,
			iconUrl: "https://example.com/hype.png",
			explorerUrl: `https://solscan.io/token/${mint}`,
		});
	});
});
