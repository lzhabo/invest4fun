import { readFileSync } from "node:fs";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { contentSecurityPolicyHeader } from "../src/security-headers.js";
import { DeterministicRanker } from "../src/server/adapters/deterministic-ranker.js";
import {
	SolanaDemoCandidateProvider,
	SolanaDemoExecutionProvider,
} from "../src/server/adapters/solana-demo.js";
import { createApp } from "../src/server/app.js";
import { loadConfig } from "../src/server/config.js";
import { MemoryStateStore } from "../src/server/store.js";

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
});

describe("Privy production security headers", () => {
	it("allows Vite's inline refresh preamble only in development", () => {
		expect(contentSecurityPolicyHeader(true)).toContain("'unsafe-inline'");
		expect(contentSecurityPolicyHeader()).not.toContain(
			"script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'",
		);
	});

	it("blocks framing and allows Privy's required web resources", async () => {
		const response = await request(app).get("/api/health").expect(200);

		expect(response.headers["x-frame-options"]).toBe("DENY");
		expect(response.headers["content-security-policy"]).toContain(
			"frame-ancestors 'none'",
		);
		expect(response.headers["content-security-policy"]).toContain(
			"frame-src https://auth.privy.io",
		);
		expect(response.headers["content-security-policy"]).toContain(
			"connect-src 'self' https://auth.privy.io",
		);
	});

	it("keeps the Vercel page policy aligned with the server policy", () => {
		const config = JSON.parse(
			readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
		) as {
			headers: Array<{
				headers: Array<{ key: string; value: string }>;
			}>;
		};
		const headers = config.headers[0]?.headers ?? [];

		expect(headers.find(({ key }) => key === "Content-Security-Policy")?.value).toBe(
			contentSecurityPolicyHeader(),
		);
		expect(headers.find(({ key }) => key === "X-Frame-Options")?.value).toBe(
			"DENY",
		);
	});
});
