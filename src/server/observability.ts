import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/node";
import type { NextFunction, Request, Response } from "express";

type LogLevel = "debug" | "info" | "warn" | "error";
type SafeField = boolean | number | string | null | undefined;

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{8,128}$/;
const SENSITIVE_FIELD =
	/authorization|cookie|token|secret|wallet|privy|email|signature|transaction|body|plan|preference|address/i;

export function requestObservability(
	request: Request,
	response: Response,
	next: NextFunction,
) {
	const supplied = request.header("x-request-id");
	const requestId =
		supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID();
	const startedAt = performance.now();
	response.locals.requestId = requestId;
	response.setHeader("X-Request-Id", requestId);
	Sentry.getIsolationScope().setTag("request_id", requestId);

	response.on("finish", () => {
		if (process.env.NODE_ENV === "test") return;
		const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
		writeLog(response.statusCode >= 500 ? "error" : "info", "request_completed", {
			requestId,
			method: request.method,
			route: normalizedRoute(request),
			statusCode: response.statusCode,
			durationMs,
		});
	});
	next();
}

export function captureRequestFailure(
	error: unknown,
	request: Request,
	response: Response,
) {
	const requestId = safeRequestId(response.locals.requestId);
	const route = normalizedRoute(request);
	writeLog("error", "request_failed", {
		requestId,
		method: request.method,
		route,
		errorCode: errorCode(error),
	});
	Sentry.captureException(safeException(error), {
		tags: {
			request_id: requestId,
			method: request.method,
			route,
		},
	});
}

export function captureOperationalFailure(
	error: unknown,
	operation: string,
	fields: Record<string, SafeField> = {},
) {
	const safeFields = sanitizeFields(fields);
	writeLog("error", "operation_failed", {
		operation,
		...safeFields,
		errorCode: errorCode(error),
	});
	Sentry.captureException(safeException(error), {
		tags: {
			operation,
			...Object.fromEntries(
				Object.entries(safeFields).map(([key, value]) => [key, String(value)]),
			),
		},
	});
}

export function captureOperationalAlert(
	event: string,
	level: "warning" | "error",
	fields: Record<string, SafeField> = {},
) {
	const safeFields = sanitizeFields(fields);
	writeLog(level === "error" ? "error" : "warn", event, safeFields);
	Sentry.captureMessage(event, {
		level,
		fingerprint: [event],
		tags: Object.fromEntries(
			Object.entries(safeFields).map(([key, value]) => [key, String(value)]),
		),
	});
}

export function writeLog(
	level: LogLevel,
	event: string,
	fields: Record<string, SafeField> = {},
) {
	if (process.env.NODE_ENV === "test") return;
	const payload = JSON.stringify({
		timestamp: new Date().toISOString(),
		level,
		event,
		...sanitizeFields(fields),
	});
	if (level === "error") console.error(payload);
	else if (level === "warn") console.warn(payload);
	else console.log(payload);
}

export function normalizedRoute(request: Request) {
	const routePath =
		typeof request.route?.path === "string" ? request.route.path : request.path;
	return `${request.baseUrl || ""}${routePath || "/"}`
		.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id")
		.replace(/0x[a-f0-9]{40,}/gi, ":id")
		.replace(/\/[1-9A-HJ-NP-Za-km-z]{32,}(?=\/|$)/g, "/:id")
		.slice(0, 200);
}

function sanitizeFields(fields: Record<string, SafeField>) {
	return Object.fromEntries(
		Object.entries(fields).filter(
			([key, value]) => !SENSITIVE_FIELD.test(key) && value !== undefined,
		),
	) as Record<string, Exclude<SafeField, undefined>>;
}

function errorCode(error: unknown) {
	if (
		error instanceof Error &&
		/^[A-Z][A-Z0-9_]{2,80}$/.test(error.message)
	) {
		return error.message;
	}
	if (error instanceof Error) return error.name || "Error";
	return "NonErrorThrown";
}

function safeException(error: unknown) {
	const code = errorCode(error);
	const safe = new Error(code);
	safe.name = error instanceof Error ? error.name || "Error" : "Error";
	if (error instanceof Error && error.stack) {
		safe.stack = [`${safe.name}: ${code}`, ...error.stack.split("\n").slice(1)].join(
			"\n",
		);
	}
	return safe;
}

function safeRequestId(value: unknown) {
	return typeof value === "string" && REQUEST_ID_PATTERN.test(value)
		? value
		: "unavailable";
}
