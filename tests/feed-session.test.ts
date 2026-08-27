import { describe, expect, it, vi } from "vitest";
import type { OnboardingPreferences } from "../src/domain/schemas.js";
import type {
	FeedResponse,
	WeeklySession,
} from "../src/client/api.js";
import { openFeedSession } from "../src/client/feed-session.js";

const preferences: OnboardingPreferences = {
	activeChain: "SOLANA",
	executionProvider: "JUPITER",
	feedRankingProvider: "DETERMINISTIC",
	cadence: "weekly",
	periodLimitUsd: 50,
	ticketSizeUsd: 1,
	riskMode: "balanced",
	assetClasses: ["CRYPTO", "STOCK_TOKEN"],
	riskDisclosureAccepted: true,
};

const session = { id: "session-1" } as WeeklySession;
const feed = { candidates: [] } as unknown as FeedResponse;

describe("feed session opening", () => {
	it("opens exactly one session and generates its feed without saving unchanged preferences", async () => {
		const events: string[] = [];
		const savePreferences = vi.fn(async () => {
			events.push("save");
			return preferences;
		});
		const openSession = vi.fn(async () => {
			events.push("open");
			return session;
		});
		const generateFeed = vi.fn(async (sessionId: string) => {
			events.push(`feed:${sessionId}`);
			return feed;
		});

		await expect(
			openFeedSession({
				preferences,
				persistPreferences: false,
				savePreferences,
				openSession,
				generateFeed,
			}),
		).resolves.toEqual({ session, feed });

		expect(events).toEqual(["open", "feed:session-1"]);
		expect(savePreferences).not.toHaveBeenCalled();
		expect(openSession).toHaveBeenCalledTimes(1);
	});

	it("saves a newly confirmed plan before opening its first session", async () => {
		const events: string[] = [];

		await openFeedSession({
			preferences,
			persistPreferences: true,
			savePreferences: async () => {
				events.push("save");
				return preferences;
			},
			openSession: async () => {
				events.push("open");
				return session;
			},
			generateFeed: async () => {
				events.push("feed");
				return feed;
			},
		});

		expect(events).toEqual(["save", "open", "feed"]);
	});
});
