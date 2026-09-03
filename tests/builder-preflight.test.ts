import request from "supertest";
import { describe, expect, it } from "vitest";
import type { Candidate, Quote } from "../src/domain/schemas.js";
import { DeterministicRanker } from "../src/server/adapters/deterministic-ranker.js";
import {
	SolanaDemoCandidateProvider,
	SolanaDemoExecutionProvider,
} from "../src/server/adapters/solana-demo.js";
import { createApp } from "../src/server/app.js";
import { loadConfig } from "../src/server/config.js";
import { MemoryStateStore } from "../src/server/store.js";

const authenticatedSolana = {
	Authorization: "Bearer demo-token",
	"X-Wallet-Chain": "SOLANA",
};

const delay = (milliseconds: number) =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

class ObservedCandidateProvider extends SolanaDemoCandidateProvider {
	active = 0;
	maxActive = 0;
	omitAssetId?: string;

	override async getCandidatesForExecution(
		wallet: string,
		assetIds: string[],
		amountInBaseUnits?: string,
		now?: Date,
	): Promise<Candidate[]> {
		this.active += 1;
		this.maxActive = Math.max(this.maxActive, this.active);
		try {
			await delay(15);
			const candidates = await super.getCandidatesForExecution(
				wallet,
				assetIds,
				amountInBaseUnits,
				now,
			);
			return candidates.filter(
				(candidate) => candidate.assetId !== this.omitAssetId,
			);
		} finally {
			this.active -= 1;
		}
	}
}

class ObservedExecutionProvider extends SolanaDemoExecutionProvider {
	active = 0;
	maxActive = 0;

	override async price(
		wallet: string,
		txOrigin: string,
		candidate: Candidate,
		amountInBaseUnits: string,
		slippageBps: number,
	): Promise<Quote> {
		this.active += 1;
		this.maxActive = Math.max(this.maxActive, this.active);
		try {
			await delay(15);
			return await super.price(
				wallet,
				txOrigin,
				candidate,
				amountInBaseUnits,
				slippageBps,
			);
		} finally {
			this.active -= 1;
		}
	}
}

async function fixture() {
	const candidates = new ObservedCandidateProvider();
	const execution = new ObservedExecutionProvider("JUPITER");
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
	const opened = await request(app)
		.post("/api/sessions/open")
		.set(authenticatedSolana)
		.send({
			cadence: "weekly",
			executionProvider: "JUPITER",
			chain: "SOLANA",
			feedRankingProvider: "DETERMINISTIC",
		})
		.expect(200);
	const available = await candidates.getCandidates("demo-wallet");
	const selections = available.slice(0, 5).map((candidate) => ({
		assetId: candidate.assetId,
		amountInBaseUnits: "200000",
	}));
	return { app, candidates, execution, sessionId: opened.body.id, selections };
}

describe("builder preflight", () => {
	it("checks independent candidates and quotes concurrently", async () => {
		const setup = await fixture();
		await request(setup.app)
			.post(`/api/sessions/${setup.sessionId}/builder/preflight`)
			.set(authenticatedSolana)
			.send({ selections: setup.selections, periodLimitUsd: 50 })
			.expect(200);

		expect(setup.candidates.maxActive).toBeGreaterThan(1);
		expect(setup.execution.maxActive).toBeGreaterThan(1);
	});

	it("reports only the unavailable asset instead of rejecting the whole Idea", async () => {
		const setup = await fixture();
		setup.candidates.omitAssetId = setup.selections[0]?.assetId;
		const response = await request(setup.app)
			.post(`/api/sessions/${setup.sessionId}/builder/preflight`)
			.set(authenticatedSolana)
			.send({ selections: setup.selections, periodLimitUsd: 50 })
			.expect(200);

		expect(response.body.issues).toContainEqual(
			expect.objectContaining({
				code: "ASSET_NOT_EXECUTABLE",
				assetId: setup.selections[0]?.assetId,
			}),
		);
		expect(response.body.issues).not.toContainEqual(
			expect.objectContaining({ code: "ASSET_NOT_ELIGIBLE" }),
		);
	});
});
