import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/server/config.js";

const base = {
	NODE_ENV: "development" as const,
	INVESTMADE_DEMO_MODE: "true" as const,
	PUBLIC_ORIGIN: "http://localhost:5173",
	SESSION_SECRET: "test-secret-that-is-at-least-32-characters",
	PRIVY_APP_ID: "test-privy-app-id",
	PRIVY_APP_SECRET: "test-privy-app-secret",
	JUPITER_API_KEY: "test-jupiter-key",
	SOLANA_RPC_URL: "https://solana.example.test",
	SOLANA_WS_URL: "wss://solana.example.test",
	COINGECKO_API_KEY: "test-coingecko-key",
};

describe("execution modes", () => {
	it("allows local live signing only as a development-time, demo-backed mode", () => {
		const config = loadConfig({ ...base, LOCAL_LIVE_EXECUTION: "true" });
		expect(config.demoMode).toBe(true);
		expect(config.localLiveExecution).toBe(true);
		expect(config.liveExecution).toBe(true);
		expect(config.livePurchasesEnabled).toBe(false);
		expect(config.liveBroadcastEnabled).toBe(false);
	});

	it("requires both explicit switches before signed transactions can broadcast", () => {
		expect(() =>
			loadConfig({ ...base, LIVE_BROADCAST_ENABLED: "true" }),
		).toThrow("LIVE_BROADCAST_ENABLED requires LIVE_PURCHASES_ENABLED=true");
		const config = loadConfig({
			...base,
			LIVE_PURCHASES_ENABLED: "true",
			LIVE_BROADCAST_ENABLED: "true",
		});
		expect(config.livePurchasesEnabled).toBe(true);
		expect(config.liveBroadcastEnabled).toBe(true);
	});

	it("validates reconciliation cron configuration", () => {
		expect(() => loadConfig({ ...base, CRON_SECRET: "too-short" })).toThrow();
		const config = loadConfig({
			...base,
			CRON_SECRET: "test-cron-secret-that-is-at-least-32-characters",
			RECONCILIATION_BATCH_SIZE: "50",
		});
		expect(config.RECONCILIATION_BATCH_SIZE).toBe(50);
	});

	it("rejects local live signing in a production process", () => {
		expect(() =>
			loadConfig({
				...base,
				NODE_ENV: "production",
				LOCAL_LIVE_EXECUTION: "true",
			}),
		).toThrow("LOCAL_LIVE_EXECUTION must not run in production");
	});

	it("requires Jupiter and Solana RPC configuration for local live execution", () => {
		const { JUPITER_API_KEY: _key, ...withoutJupiter } = base;
		expect(() =>
			loadConfig({ ...withoutJupiter, LOCAL_LIVE_EXECUTION: "true" }),
		).toThrow("JUPITER_API_KEY is required for live execution");
	});

	it("requires only the Solana execution provider for live execution", () => {
		const config = loadConfig({ ...base, LOCAL_LIVE_EXECUTION: "true" });
		expect(config.liveExecution).toBe(true);
	});

	it("starts live production when persistent state, quotes, and private inference are configured", () => {
		const config = loadConfig({
			...base,
			NODE_ENV: "production",
			INVESTMADE_DEMO_MODE: "false",
			DATABASE_URL: "postgresql://user:password@example.com:5432/investmade",
			ZG_ROUTER_API_KEY: "test-0g-router-key",
		});

		expect(config.liveExecution).toBe(true);
		expect(config.demoMode).toBe(false);
	});
});
