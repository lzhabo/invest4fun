export type AppEntryStage =
	| "bootstrapping"
	| "loading"
	| "onboarding"
	| "funding"
	| "swipe"
	| "review";

export type AppEntryView =
	| "SKELETON"
	| "ONBOARDING"
	| "WALLET_REQUIRED"
	| "APP";

export function resolveAppEntryView({
	stage,
	authenticated,
	hasEmbeddedWallet,
	hasFeed,
}: {
	stage: AppEntryStage;
	authenticated: boolean;
	hasEmbeddedWallet: boolean;
	hasFeed: boolean;
}): AppEntryView {
	if (stage === "bootstrapping" || (stage === "loading" && !hasFeed)) {
		return "SKELETON";
	}
	if (stage === "onboarding") return "ONBOARDING";
	if (authenticated && !hasEmbeddedWallet) return "WALLET_REQUIRED";
	return "APP";
}
