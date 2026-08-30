import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();

if (dsn) {
	Sentry.init({
		dsn,
		environment:
			import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
		release: import.meta.env.VITE_SENTRY_RELEASE,
		sendDefaultPii: false,
		integrations: [
			Sentry.browserTracingIntegration(),
			Sentry.replayIntegration({
				maskAllText: true,
				blockAllMedia: true,
			}),
		],
		tracePropagationTargets: [window.location.origin, /^\/api\//],
		tracesSampleRate: sampleRate(
			import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE,
			0.05,
		),
		replaysSessionSampleRate: sampleRate(
			import.meta.env.VITE_SENTRY_REPLAY_SESSION_SAMPLE_RATE,
			0.01,
		),
		replaysOnErrorSampleRate: sampleRate(
			import.meta.env.VITE_SENTRY_REPLAY_ERROR_SAMPLE_RATE,
			1,
		),
		beforeSend(event) {
			delete event.user;
			delete event.extra;
			if (event.message) event.message = redactText(event.message);
			for (const exception of event.exception?.values ?? []) {
				if (exception.value) exception.value = redactText(exception.value);
			}
			if (event.request) {
				delete event.request.cookies;
				delete event.request.data;
				delete event.request.headers;
				delete event.request.query_string;
				if (event.request.url) event.request.url = stripQuery(event.request.url);
			}
			return event;
		},
		beforeBreadcrumb(breadcrumb) {
			const message = breadcrumb.message
				? redactText(breadcrumb.message)
				: breadcrumb.message;
			if (!breadcrumb.data) return { ...breadcrumb, message };
			const data = Object.fromEntries(
				Object.entries(breadcrumb.data).filter(
					([key]) =>
						!/authorization|cookie|token|secret|wallet|email|body|data/i.test(
							key,
						),
				),
			);
			if (typeof data.url === "string") data.url = stripQuery(data.url);
			return {
				...breadcrumb,
				message,
				data,
			};
		},
	});
}

export const captureException = Sentry.captureException;
export const SentryErrorBoundary = Sentry.ErrorBoundary;

function sampleRate(value: string | undefined, fallback: number) {
	if (!value) return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
		? parsed
		: fallback;
}

function stripQuery(value: string) {
	try {
		const url = new URL(value, window.location.origin);
		const pathname = redactText(url.pathname);
		return url.origin === window.location.origin
			? pathname
			: `${url.origin}${pathname}`;
	} catch {
		return value.split("?", 1)[0] ?? "/";
	}
}

function redactText(value: string) {
	return value
		.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
		.replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
		.replace(/0x[a-f0-9]{40,}/gi, "[hex-id]")
		.replace(/\b[1-9A-HJ-NP-Za-km-z]{32,}\b/g, "[opaque-id]");
}
