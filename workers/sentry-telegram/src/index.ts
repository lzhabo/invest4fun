export interface Env {
	TELEGRAM_BOT_TOKEN: string;
	TELEGRAM_CHAT_ID: string;
	SENTRY_WEBHOOK_SECRET: string;
}

interface SentryWebhook {
	data?: {
		issue?: { project?: { slug?: string }; level?: string };
	};
	project?: { slug?: string };
}

const MAX_BODY_BYTES = 256_000;
const PROJECT_LABELS: Record<string, string> = {
	"investmade-web": "web",
	"investmade-api": "api",
};

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === "GET") return Response.json({ status: "ok" });
		if (request.method !== "POST") {
			return new Response("Method not allowed", { status: 405 });
		}
		if (!authorized(request, env.SENTRY_WEBHOOK_SECRET)) {
			return new Response("Unauthorized", { status: 401 });
		}
		const declaredLength = Number(request.headers.get("content-length") ?? 0);
		if (declaredLength > MAX_BODY_BYTES) {
			return new Response("Payload too large", { status: 413 });
		}

		let payload: SentryWebhook;
		try {
			const raw = await request.text();
			if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
				return new Response("Payload too large", { status: 413 });
			}
			payload = JSON.parse(raw) as SentryWebhook;
		} catch {
			return new Response("Invalid JSON", { status: 400 });
		}

		const projectSlug =
			payload.data?.issue?.project?.slug ?? payload.project?.slug ?? "";
		const project = PROJECT_LABELS[projectSlug] ?? "application";
		const level = payload.data?.issue?.level === "warning" ? "WARNING" : "CRITICAL";
		const telegramResponse = await fetch(
			`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					chat_id: env.TELEGRAM_CHAT_ID,
					disable_web_page_preview: true,
					text: `🚨 ${level}: investmade ${project} alert. Open Sentry for redacted diagnostic details.`,
				}),
			},
		);
		if (!telegramResponse.ok) {
			return new Response("Telegram delivery failed", { status: 502 });
		}
		return Response.json({ delivered: true });
	},
};

function authorized(request: Request, expected: string) {
	const actual = request.headers.get("x-investmade-webhook-secret") ?? "";
	if (!expected || actual.length !== expected.length) return false;
	let difference = 0;
	for (let index = 0; index < actual.length; index += 1) {
		difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
	}
	return difference === 0;
}

