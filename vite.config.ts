import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { contentSecurityPolicyHeader } from "./src/security-headers.js";

export default defineConfig(() => {
	const sentryBuildEnabled = Boolean(
		process.env.SENTRY_AUTH_TOKEN &&
			process.env.SENTRY_ORG &&
			process.env.SENTRY_PROJECT_WEB,
	);
	const sentryRelease =
		process.env.VITE_SENTRY_RELEASE ??
		process.env.SENTRY_RELEASE ??
		process.env.VERCEL_GIT_COMMIT_SHA ??
		"";
	return {
		define: {
			"import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(sentryRelease),
		},
		plugins: [
			react(),
			...(sentryBuildEnabled
				? [
						sentryVitePlugin({
							org: process.env.SENTRY_ORG,
							project: process.env.SENTRY_PROJECT_WEB,
							authToken: process.env.SENTRY_AUTH_TOKEN,
							telemetry: false,
							release: sentryRelease ? { name: sentryRelease } : undefined,
							sourcemaps: {
								filesToDeleteAfterUpload: ["./dist/client/**/*.map"],
							},
						}),
					]
				: []),
		],
		test: {
			exclude: ["**/node_modules/**", "**/.worktrees/**", "apps/**"],
		},
		resolve: {
			alias: {
				"@": path.resolve(__dirname, "./src"),
			},
		},
		root: ".",
		server: {
			port: 5173,
			headers: {
				"Content-Security-Policy": contentSecurityPolicyHeader(true),
				"X-Frame-Options": "DENY",
				"X-Content-Type-Options": "nosniff",
				"Referrer-Policy": "strict-origin-when-cross-origin",
			},
			proxy: {
				"/api": process.env.API_PROXY_TARGET ?? "http://localhost:8787",
			},
		},
		build: {
			outDir: "dist/client",
			sourcemap: sentryBuildEnabled ? ("hidden" as const) : false,
		},
	};
});
