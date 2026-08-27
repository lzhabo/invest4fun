import { describe, expect, it } from "vitest";
import { newAccountDraft } from "../src/client/onboarding-defaults.js";

describe("new account onboarding defaults", () => {
	it("prefills the agreed weekly mixed-asset plan without accepting risk", () => {
		expect(newAccountDraft()).toMatchObject({
			activeChain: "SOLANA",
			executionProvider: "JUPITER",
			feedRankingProvider: "DETERMINISTIC",
			cadence: "weekly",
			periodLimitUsd: 50,
			periodLimitChoice: 50,
			ticketSizeUsd: 1,
			ticketChoice: 1,
			riskMode: "balanced",
			assetChoice: "BOTH",
			riskDisclosureAccepted: false,
		});
	});
});
