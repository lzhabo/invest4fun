import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SOLANA_USDC_MINT } from "../src/domain/solana.js";
import type { OnboardingPreferences } from "../src/domain/schemas.js";
import { createServerApp } from "../src/server/bootstrap.js";

const authenticatedSolana = {
	Authorization: "Bearer demo-token",
	"X-Wallet-Chain": "SOLANA",
};

const solanaPreferences = {
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

describe("runtime composition", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it("keeps the Solana demo feed offline even when provider keys are configured", async () => {
		vi.stubEnv("NODE_ENV", "test");
		vi.stubEnv("INVESTMADE_DEMO_MODE", "true");
		vi.stubEnv("LOCAL_LIVE_EXECUTION", "false");
		vi.stubEnv("PUBLIC_ORIGIN", "http://localhost:5173");
		vi.stubEnv(
			"SESSION_SECRET",
			"test-secret-that-is-at-least-32-characters",
		);
		vi.stubEnv("PRIVY_APP_ID", "test-privy-app-id");
		vi.stubEnv("PRIVY_APP_SECRET", "test-privy-app-secret");
		vi.stubEnv("JUPITER_API_KEY", "configured-but-unused-in-demo");
		vi.stubEnv("COINGECKO_API_KEY", "configured-but-unused-in-demo");
		vi.stubEnv("SOLANA_RPC_URL", "https://solana.example.test");
		vi.stubEnv("SOLANA_WS_URL", "wss://solana.example.test");
		const externalFetch = vi.fn<typeof fetch>().mockRejectedValue(
			new Error("DEMO_MUST_NOT_CALL_EXTERNAL_PROVIDERS"),
		);
		vi.stubGlobal("fetch", externalFetch);
		const app = createServerApp();

		const opened = await request(app)
			.post("/api/sessions/open")
			.set(authenticatedSolana)
			.send({
				cadence: solanaPreferences.cadence,
				executionProvider: solanaPreferences.executionProvider,
				chain: solanaPreferences.activeChain,
				feedRankingProvider: solanaPreferences.feedRankingProvider,
			})
			.expect(200);

		await request(app)
			.post(`/api/sessions/${opened.body.id}/feed`)
			.set(authenticatedSolana)
			.send(solanaPreferences)
			.expect(200)
			.expect(({ body }) => {
				expect(body.candidates.length).toBeGreaterThan(0);
				expect(
					body.candidates.every(
						(candidate: { chain: string }) => candidate.chain === "SOLANA",
					),
				).toBe(true);
			});
		expect(externalFetch).not.toHaveBeenCalled();
	});

	it("prepares and settles a Solana demo basket without external providers", async () => {
		vi.stubEnv("NODE_ENV", "test");
		vi.stubEnv("INVESTMADE_DEMO_MODE", "true");
		vi.stubEnv("LOCAL_LIVE_EXECUTION", "false");
		vi.stubEnv("PUBLIC_ORIGIN", "http://localhost:5173");
		vi.stubEnv(
			"SESSION_SECRET",
			"test-secret-that-is-at-least-32-characters",
		);
		vi.stubEnv("PRIVY_APP_ID", "test-privy-app-id");
		vi.stubEnv("PRIVY_APP_SECRET", "test-privy-app-secret");
		vi.stubEnv("JUPITER_API_KEY", "configured-but-unused-in-demo");
		vi.stubEnv("SOLANA_RPC_URL", "https://solana.example.test");
		vi.stubEnv("SOLANA_WS_URL", "wss://solana.example.test");
		const externalFetch = vi.fn<typeof fetch>().mockRejectedValue(
			new Error("DEMO_MUST_NOT_CALL_EXTERNAL_PROVIDERS"),
		);
		vi.stubGlobal("fetch", externalFetch);
		const app = createServerApp();

		const opened = await request(app)
			.post("/api/sessions/open")
			.set(authenticatedSolana)
			.send({
				cadence: solanaPreferences.cadence,
				executionProvider: solanaPreferences.executionProvider,
				chain: solanaPreferences.activeChain,
				feedRankingProvider: solanaPreferences.feedRankingProvider,
			})
			.expect(200);
		const feed = await request(app)
			.post(`/api/sessions/${opened.body.id}/feed`)
			.set(authenticatedSolana)
			.send(solanaPreferences)
			.expect(200);
		const selected = feed.body.candidates[0];

		const prepared = await request(app)
			.post("/api/executions/prepare")
			.set(authenticatedSolana)
			.send({
				sessionId: opened.body.id,
				chain: "SOLANA",
				cluster: "mainnet-beta",
				inputToken: SOLANA_USDC_MINT,
				periodLimitUsd: 100,
				selections: [
					{ assetId: selected.assetId, amountInBaseUnits: "10000000" },
				],
				slippageBps: 50,
			})
			.expect(200);

		expect(prepared.body.kind).toBe("SOLANA_TRANSACTION");
		expect(prepared.body.plan.chain).toBe("SOLANA");
		expect(prepared.body.plan.quotes).toHaveLength(1);
		expect(prepared.body.solanaTransaction).toEqual(
			expect.objectContaining({ kind: "SOLANA_TRANSACTION" }),
		);

		const settled = await request(app)
			.post(`/api/executions/${prepared.body.plan.executionId}/demo-settle`)
			.set(authenticatedSolana)
			.expect(200);
		expect(settled.body.status).toBe("SETTLED");
		expect(settled.body.settledOutputs).toEqual([
			expect.objectContaining({
				assetId: selected.assetId,
				status: "success",
			}),
		]);
		expect(externalFetch).not.toHaveBeenCalled();
	});

	it("publishes a Solana-only runtime configuration", async () => {
		vi.stubEnv("NODE_ENV", "test");
		vi.stubEnv("INVESTMADE_DEMO_MODE", "true");
		vi.stubEnv("LOCAL_LIVE_EXECUTION", "false");
		vi.stubEnv("PUBLIC_ORIGIN", "http://localhost:5173");
		vi.stubEnv(
			"SESSION_SECRET",
			"test-secret-that-is-at-least-32-characters",
		);
		vi.stubEnv("PRIVY_APP_ID", "test-privy-app-id");
		vi.stubEnv("PRIVY_APP_SECRET", "test-privy-app-secret");
		const response = await request(createServerApp()).get("/api/config").expect(200);

		expect(response.body).toMatchObject({
			chain: "SOLANA",
			cluster: "mainnet-beta",
			stableToken: "USDC",
			inputMint: SOLANA_USDC_MINT,
			executionProviders: {
				JUPITER: { available: true },
			},
		});
		expect(response.body).not.toHaveProperty("chainId");
		expect(response.body).not.toHaveProperty("solana");
	});
});
