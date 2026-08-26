import request from "supertest";
import { describe, expect, it } from "vitest";
import type { OnboardingPreferences } from "../src/domain/schemas.js";
import { DeterministicRanker } from "../src/server/adapters/deterministic-ranker.js";
import {
	SolanaDemoCandidateProvider,
	SolanaDemoExecutionProvider,
} from "../src/server/adapters/solana-demo.js";
import { createApp } from "../src/server/app.js";
import { loadConfig } from "../src/server/config.js";
import { MemoryStateStore } from "../src/server/store.js";

const preferences = {
	activeChain: "SOLANA",
	cadence: "weekly",
	periodLimitUsd: 100,
	ticketSizeUsd: 10,
	riskMode: "balanced",
	assetClasses: ["CRYPTO", "STOCK_TOKEN"],
	riskDisclosureAccepted: true,
	executionProvider: "JUPITER",
	feedRankingProvider: "DETERMINISTIC",
} satisfies OnboardingPreferences;

describe("Solana market enrichment", () => {
	it("keeps the feed available when optional market enrichment fails", async () => {
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
			}),
			store: new MemoryStateStore(),
			candidates,
			solanaCandidateProviders: { JUPITER: candidates },
			inference: new DeterministicRanker(),
			execution,
			solanaExecutionProviders: { JUPITER: execution },
			marketData: {
				enrichRankingCandidates: async () => {
					throw new Error("COINGECKO_MARKETS_429");
				},
				history: async () => ({ source: "coingecko", points: [] }),
			},
		});
		const headers = {
			Authorization: "Bearer demo-token",
			"X-Wallet-Chain": "SOLANA",
		};
		const session = await request(app)
			.post("/api/sessions/open")
			.set(headers)
			.send({
				cadence: "weekly",
				executionProvider: "JUPITER",
				chain: "SOLANA",
				feedRankingProvider: "DETERMINISTIC",
			})
			.expect(200);

		const feed = await request(app)
			.post(`/api/sessions/${session.body.id}/feed`)
			.set(headers)
			.send(preferences)
			.expect(200);
		expect(feed.body.candidates.length).toBeGreaterThan(0);
		expect(feed.body.candidates[0].chain).toBe("SOLANA");
	});
});
