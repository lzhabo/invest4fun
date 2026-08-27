import { describe, expect, it } from "vitest";
import {
	assertCanonicalExecutionOwner,
	assertPlanQuotesFresh,
} from "../src/server/live-purchase-safety.js";
import type { UserAccount, WeeklySession } from "../src/server/store.js";

const embeddedWallet = "7dHbWXadHki3tFQ5wPzQ3pQZf2fQxv9KZQmXWm8pY7e";
const externalWallet = "8dHbWXadHki3tFQ5wPzQ3pQZf2fQxv9KZQmXWm8pY7e";
const account: UserAccount = {
	privyUserId: "did:privy:test-user",
	canonicalSolanaWallet: embeddedWallet,
	timezone: "UTC",
	onboardingVersion: 1,
	createdAt: "2026-08-27T12:00:00.000Z",
};
const session: WeeklySession = {
	id: "session-1",
	ownerId: account.privyUserId,
	wallet: embeddedWallet,
	epochId: "weekly:2026-08-24",
	chain: "SOLANA",
	executionProvider: "JUPITER",
	feedRankingProvider: "DETERMINISTIC",
	status: "OPEN",
	createdAt: "2026-08-27T12:00:00.000Z",
};

describe("live purchase safety", () => {
	it("allows only the account owner's canonical embedded wallet", () => {
		expect(() =>
			assertCanonicalExecutionOwner({
				account,
				actorUserId: account.privyUserId,
				actorWallet: embeddedWallet,
				session,
			}),
		).not.toThrow();
	});

	it("rejects a linked external funding wallet as the signer", () => {
		expect(() =>
			assertCanonicalExecutionOwner({
				account,
				actorUserId: account.privyUserId,
				actorWallet: externalWallet,
				session,
			}),
		).toThrowError(expect.objectContaining({ code: "CANONICAL_WALLET_REQUIRED" }));
	});

	it("does not reveal an execution owned by another Privy user", () => {
		expect(() =>
			assertCanonicalExecutionOwner({
				account,
				actorUserId: account.privyUserId,
				actorWallet: embeddedWallet,
				session: { ...session, ownerId: "did:privy:someone-else" },
			}),
		).toThrowError(expect.objectContaining({ code: "EXECUTION_NOT_FOUND" }));
	});

	it("rejects a plan when any leg's quote is expired", () => {
		const quote = (expiresAt: string) => ({ expiresAt });
		expect(() =>
			assertPlanQuotesFresh(
				{ quotes: [quote("2026-08-27T12:00:01.000Z")] as never },
				new Date("2026-08-27T12:00:00.000Z"),
			),
		).not.toThrow();
		expect(() =>
			assertPlanQuotesFresh(
				{ quotes: [quote("2026-08-27T11:59:59.000Z")] as never },
				new Date("2026-08-27T12:00:00.000Z"),
			),
		).toThrowError(expect.objectContaining({ code: "QUOTE_EXPIRED" }));
	});
});
