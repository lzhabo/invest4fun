import type { OnboardingPreferences } from "../domain/schemas.js";

export type NewAccountDraft = {
	executionProvider: OnboardingPreferences["executionProvider"];
	feedRankingProvider: OnboardingPreferences["feedRankingProvider"];
	activeChain: "SOLANA";
	cadence: OnboardingPreferences["cadence"];
	periodLimitUsd: number;
	periodLimitChoice: 50;
	customPeriodLimitInput: string;
	ticketSizeUsd: number;
	ticketChoice: 1;
	customTicketInput: string;
	riskMode: OnboardingPreferences["riskMode"];
	assetChoice: "BOTH";
	riskDisclosureAccepted: false;
};

export function newAccountDraft(): NewAccountDraft {
	return {
		activeChain: "SOLANA",
		executionProvider: "JUPITER",
		feedRankingProvider: "DETERMINISTIC",
		cadence: "weekly",
		periodLimitUsd: 50,
		periodLimitChoice: 50,
		customPeriodLimitInput: "",
		ticketSizeUsd: 1,
		ticketChoice: 1,
		customTicketInput: "",
		riskMode: "balanced",
		assetChoice: "BOTH",
		riskDisclosureAccepted: false,
	};
}
