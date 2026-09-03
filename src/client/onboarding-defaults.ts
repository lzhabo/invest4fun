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
	ticketChoice: 0.1;
	customTicketInput: string;
	riskMode: OnboardingPreferences["riskMode"];
	assetChoice: "BOTH";
	riskDisclosureAccepted: false;
};

export function newAccountPreferences() {
	return {
		activeChain: "SOLANA",
		executionProvider: "JUPITER",
		feedRankingProvider: "DETERMINISTIC",
		cadence: "weekly",
		periodLimitUsd: 50,
		ticketSizeUsd: 0.1,
		riskMode: "balanced",
		assetClasses: ["CRYPTO", "STOCK_TOKEN"],
		riskDisclosureAccepted: true,
	} satisfies OnboardingPreferences;
}

export function newAccountDraft(): NewAccountDraft {
	const defaults = newAccountPreferences();
	return {
		activeChain: defaults.activeChain,
		executionProvider: defaults.executionProvider,
		feedRankingProvider: defaults.feedRankingProvider,
		cadence: defaults.cadence,
		periodLimitUsd: defaults.periodLimitUsd,
		periodLimitChoice: 50,
		customPeriodLimitInput: "",
		ticketSizeUsd: defaults.ticketSizeUsd,
		ticketChoice: 0.1,
		customTicketInput: "",
		riskMode: defaults.riskMode,
		assetChoice: "BOTH",
		riskDisclosureAccepted: false,
	};
}
