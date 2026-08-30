import * as Sentry from "@sentry/node";
import { config as loadEnvironment } from "dotenv";

loadEnvironment({ path: ".env.local", quiet: true });
loadEnvironment({ path: ".env", quiet: true });

const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
	Sentry.init({
		dsn,
		environment:
			process.env.SENTRY_ENVIRONMENT ??
			process.env.VERCEL_ENV ??
			process.env.NODE_ENV ??
			"development",
		release:
			process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA,
		sendDefaultPii: false,
		includeLocalVariables: false,
		tracesSampleRate: sampleRate(
			process.env.SENTRY_TRACES_SAMPLE_RATE,
			0.05,
		),
		integrations(defaultIntegrations) {
			return [
				...defaultIntegrations.filter(
					(integration) => integration.name !== "RequestData",
				),
				Sentry.requestDataIntegration({
					include: {
						cookies: false,
						data: false,
						headers: false,
						ip: false,
						query_string: false,
						url: true,
					},
				}),
			];
		},
		beforeSend: sanitizeSentryEvent,
		beforeSendTransaction: sanitizeSentryEvent,
	});
}

function sampleRate(value: string | undefined, fallback: number) {
	if (value === undefined || value.trim() === "") return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
		? parsed
		: fallback;
}

export function sanitizeSentryEvent<T extends Sentry.Event>(event: T): T {
	delete event.user;
	delete event.extra;
	if (event.message) event.message = redactText(event.message);
	if (event.transaction) event.transaction = redactText(event.transaction);
	for (const exception of event.exception?.values ?? []) {
		if (exception.value) exception.value = redactText(exception.value);
	}
	if (event.contexts) {
		event.contexts = Object.fromEntries(
			Object.entries(event.contexts).filter(([key]) =>
				["app", "browser", "device", "os", "runtime", "trace"].includes(key),
			),
		);
	}
	if (event.request) {
		delete event.request.cookies;
		delete event.request.data;
		delete event.request.env;
		delete event.request.headers;
		delete event.request.query_string;
		if (event.request.url) event.request.url = sanitizeUrl(event.request.url);
	}
	if (event.breadcrumbs) {
		event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => ({
			...breadcrumb,
			message: breadcrumb.message
				? redactText(breadcrumb.message)
				: breadcrumb.message,
			data: sanitizeBreadcrumbData(breadcrumb.data),
		}));
	}
	return event;
}

function sanitizeUrl(value: string) {
	try {
		const url = new URL(value, "https://telemetry.invalid");
		const pathname = redactText(url.pathname);
		return url.origin === "https://telemetry.invalid"
			? pathname
			: `${url.origin}${pathname}`;
	} catch {
		return value.split("?", 1)[0] ?? "/";
	}
}

function sanitizeBreadcrumbData(
	data: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	if (!data) return undefined;
	const safe: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(data)) {
		if (/authorization|cookie|token|secret|wallet|email|body|data/i.test(key)) {
			continue;
		}
		safe[key] =
			key === "url" && typeof value === "string"
				? sanitizeUrl(value)
				: typeof value === "string"
					? redactText(value)
					: value;
	}
	return safe;
}

function redactText(value: string) {
	return value
		.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
		.replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
		.replace(/0x[a-f0-9]{40,}/gi, "[hex-id]")
		.replace(/\b[1-9A-HJ-NP-Za-km-z]{32,}\b/g, "[opaque-id]");
}
