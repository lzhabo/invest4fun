import { afterEach, describe, expect, it, vi } from "vitest";
import worker, {
	type Env,
} from "../workers/sentry-telegram/src/index.js";

const env: Env = {
	TELEGRAM_BOT_TOKEN: "test-bot-token",
	TELEGRAM_CHAT_ID: "-1001234567890",
	SENTRY_WEBHOOK_SECRET: "test-webhook-secret",
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("Sentry Telegram relay", () => {
	it("rejects requests without the private relay header", async () => {
		const outbound = vi.fn();
		vi.stubGlobal("fetch", outbound);
		const response = await worker.fetch(
			new Request("https://relay.example.test", {
				method: "POST",
				body: "{}",
			}),
			env,
		);
		expect(response.status).toBe(401);
		expect(outbound).not.toHaveBeenCalled();
	});

	it("sends only a generic message and never forwards issue content", async () => {
		const outbound = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
		vi.stubGlobal("fetch", outbound);
		const sensitiveTitle = "wallet 123 failed with signed transaction payload";
		const response = await worker.fetch(
			new Request("https://relay.example.test", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Investmade-Webhook-Secret": env.SENTRY_WEBHOOK_SECRET,
				},
				body: JSON.stringify({
					data: {
						issue: {
							title: sensitiveTitle,
							level: "error",
							project: { slug: "investmade-api" },
						},
					},
				}),
			}),
			env,
		);

		expect(response.status).toBe(200);
		const init = outbound.mock.calls[0]?.[1] as RequestInit;
		const body = String(init.body);
		expect(body).toContain("CRITICAL: investmade api alert");
		expect(body).not.toContain(sensitiveTitle);
		expect(body).not.toContain("wallet");
		expect(body).not.toContain("transaction");
	});
});
