import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { sanitizeSentryEvent } from "../src/server/instrument.js";
import { requestObservability } from "../src/server/observability.js";

describe("Sentry privacy boundary", () => {
	it("removes identities, request payloads, credentials, and URL queries", () => {
		const event = sanitizeSentryEvent({
			message: "wallet 4JFKA5smQXNHvDWiikRwnk5zCTBsN6vYiTfzAP9zPvSp failed",
			user: { id: "privy-user", email: "person@example.com" },
			request: {
				url: "https://investmade.example/api/portfolio/4JFKA5smQXNHvDWiikRwnk5zCTBsN6vYiTfzAP9zPvSp?token=secret",
				cookies: { session: "secret" },
				data: { signedTransaction: "secret" },
				headers: { authorization: "Bearer secret" },
				query_string: "token=secret",
			},
			breadcrumbs: [
				{
					data: {
						url: "https://investmade.example/api/feed?wallet=secret",
						authorization: "Bearer secret",
						status_code: 500,
					},
				},
			],
		});

		expect(event.user).toBeUndefined();
		expect(event.message).toBe("wallet [opaque-id] failed");
		expect(event.request).toEqual({
			url: "https://investmade.example/api/portfolio/[opaque-id]",
		});
		expect(event.breadcrumbs?.[0]?.data).toEqual({
			url: "https://investmade.example/api/feed",
			status_code: 500,
		});
	});
});

describe("request correlation", () => {
	it("returns a safe caller request id and replaces unsafe values", async () => {
		const app = express();
		app.use(requestObservability);
		app.get("/api/example/:id", (_request, response) =>
			response.json({ requestId: response.locals.requestId }),
		);

		const supplied = "client-request-1234";
		const accepted = await request(app)
			.get("/api/example/123")
			.set("X-Request-Id", supplied)
			.expect(200);
		expect(accepted.headers["x-request-id"]).toBe(supplied);
		expect(accepted.body.requestId).toBe(supplied);

		const replaced = await request(app)
			.get("/api/example/123")
			.set("X-Request-Id", "unsafe value with spaces")
			.expect(200);
		expect(replaced.headers["x-request-id"]).toMatch(
			/^[0-9a-f]{8}-[0-9a-f-]{27,}$/,
		);
	});
});
