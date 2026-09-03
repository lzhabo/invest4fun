import { describe, expect, it } from "vitest";
import type { OnboardingPreferences } from "../src/domain/schemas.js";
import { ApiError } from "../src/client/api.js";
import { resolveAccountBootstrap } from "../src/client/account-bootstrap.js";

const savedPreferences: OnboardingPreferences = {
	activeChain: "SOLANA",
	executionProvider: "JUPITER",
	feedRankingProvider: "DETERMINISTIC",
	cadence: "weekly",
	periodLimitUsd: 25,
	ticketSizeUsd: 1,
	riskMode: "balanced",
	assetClasses: ["CRYPTO", "STOCK_TOKEN"],
	riskDisclosureAccepted: true,
};

describe("account bootstrap", () => {
	it("resumes a returning account from authoritative server preferences", async () => {
		const events: string[] = [];
		await expect(
			resolveAccountBootstrap({
				ensureAccount: async () => {
					events.push("account");
				},
				loadPreferences: async () => {
					events.push("preferences");
					return savedPreferences;
				},
				readCachedPreferences: () => undefined,
			}),
		).resolves.toEqual({ state: "returning", preferences: savedPreferences });
		expect(events).toEqual(["account", "preferences"]);
	});

	it("identifies a new account when the server confirms preferences are absent", async () => {
		await expect(
			resolveAccountBootstrap({
				ensureAccount: async () => undefined,
				loadPreferences: async () => {
					throw new ApiError("PREFERENCES_NOT_FOUND", "Missing", {});
				},
				readCachedPreferences: () => savedPreferences,
			}),
		).resolves.toEqual({ state: "new" });
	});

	it("does not turn a temporary server failure into a new account", async () => {
		const error = new ApiError("REQUEST_FAILED", "Unavailable", {});
		await expect(
			resolveAccountBootstrap({
				ensureAccount: async () => undefined,
				loadPreferences: async () => {
					throw error;
				},
				readCachedPreferences: () => savedPreferences,
			}),
		).resolves.toEqual({
			state: "unavailable",
			cachedPreferences: savedPreferences,
			error,
		});
	});

	it("separates an expired login from recoverable availability errors", async () => {
		const error = new ApiError("AUTH_REQUIRED", "Sign in again", {});
		await expect(
			resolveAccountBootstrap({
				ensureAccount: async () => undefined,
				loadPreferences: async () => {
					throw error;
				},
				readCachedPreferences: () => undefined,
			}),
		).resolves.toEqual({ state: "reauthenticate", error });
	});
});
