import type { OnboardingPreferences } from "../domain/schemas.js";
import type { FeedResponse, WeeklySession } from "./api.js";

export async function openFeedSession(deps: {
	preferences: OnboardingPreferences;
	persistPreferences: boolean;
	savePreferences: (
		preferences: OnboardingPreferences,
	) => Promise<OnboardingPreferences>;
	openSession: (
		preferences: OnboardingPreferences,
	) => Promise<WeeklySession>;
	generateFeed: (
		sessionId: string,
		preferences: OnboardingPreferences,
	) => Promise<FeedResponse>;
}): Promise<{ session: WeeklySession; feed: FeedResponse }> {
	if (deps.persistPreferences) {
		await deps.savePreferences(deps.preferences);
	}
	const session = await deps.openSession(deps.preferences);
	const feed = await deps.generateFeed(session.id, deps.preferences);
	return { session, feed };
}
