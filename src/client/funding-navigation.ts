import type { AppEntryStage } from "./app-entry-route.js";
import type { PrimaryView } from "./view-routing.js";

export function stageAfterPrimaryNavigation({
	currentStage,
	target,
	fundingActive,
	hasFeed,
}: {
	currentStage: AppEntryStage;
	target: PrimaryView;
	fundingActive: boolean;
	hasFeed: boolean;
}): AppEntryStage {
	if (currentStage === "onboarding") return currentStage;
	if (target === "week" && fundingActive) return "funding";
	if (currentStage === "funding" && target !== "week") return "swipe";
	if (
		currentStage === "review" ||
		(target === "week" && currentStage === "loading" && hasFeed)
	) {
		return "swipe";
	}
	return currentStage;
}
