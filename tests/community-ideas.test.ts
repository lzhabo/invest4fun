import { describe, expect, it } from "vitest";
import { COMMUNITY_IDEAS } from "../src/client/community-ideas.js";

describe("community ideas catalog", () => {
	it("ports the complete reference catalog in its established order", () => {
		expect(COMMUNITY_IDEAS).toHaveLength(33);
		expect(COMMUNITY_IDEAS.map((idea) => idea.id)).toEqual([
			"mag7-spacex",
			"nancy-pelosi",
			"warren-buffett",
			"leopold-aschenbrenner",
			"cathie-wood",
			"mag-seven",
			"hard-money",
			"quantum-bet",
			"energy-infra",
			"pure-silicon",
			"neo-finance",
			"compute-grab",
			"ai-full-stack",
			"defense-trade",
			"digital-fortress",
			"black-gold",
			"space-race",
			"mine-future",
			"going-nuclear",
			"consumer-brands",
			"modern-medicine",
			"road-ahead",
			"tokenized-treasury-yield",
			"indian-origin-ceo-basket",
			"paypal-mafia",
			"peptides-core",
			"digital-dementia-fund",
			"ozempic-glp-1",
			"made-in-america",
			"ansem-alpha",
			"a16z-index",
			"hormuz-index",
			"humanoids",
		]);
	});

	it("keeps every explicit illustrative allocation at exactly 100%", () => {
		for (const idea of COMMUNITY_IDEAS) {
			if (!idea.holdings) continue;
			expect(
				idea.holdings.reduce((sum, holding) => sum + holding.weightBps, 0),
				idea.id,
			).toBe(10_000);
		}
	});
});
