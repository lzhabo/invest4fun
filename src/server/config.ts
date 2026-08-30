import { z } from "zod";

const envSchema = z
	.object({
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
		INVESTMADE_DEMO_MODE: z.enum(["true", "false"]).default("true"),
		LOCAL_LIVE_EXECUTION: z.enum(["true", "false"]).default("false"),
		LIVE_PURCHASES_ENABLED: z.enum(["true", "false"]).default("false"),
		LIVE_BROADCAST_ENABLED: z.enum(["true", "false"]).default("false"),
		PORT: z.coerce.number().int().positive().default(8787),
		PUBLIC_ORIGIN: z.string().url().default("http://localhost:5173"),
		SESSION_SECRET: z
			.string()
			.min(32)
			.default("local-demo-only-secret-change-me-000"),
		PRIVY_APP_ID: z.string().min(1),
		PRIVY_APP_SECRET: z.string().min(1),
		DATABASE_URL: z.string().optional(),
		JUPITER_API_KEY: z.string().optional(),
		SOLANA_RPC_URL: z.string().url().optional(),
		SOLANA_WS_URL: z.string().url().optional(),
		CRON_SECRET: z.string().min(32).optional(),
		RECONCILIATION_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(20),
		COINGECKO_API_KEY: z.string().optional(),
		ZG_ROUTER_API_KEY: z.string().optional(),
		SENTRY_DSN: z.string().url().optional(),
		SENTRY_ENVIRONMENT: z.string().min(1).optional(),
		SENTRY_RELEASE: z.string().min(1).optional(),
		SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.05),
	})
	.superRefine((env, context) => {
		if (
			env.LOCAL_LIVE_EXECUTION === "true" &&
			env.INVESTMADE_DEMO_MODE !== "true"
		) {
			context.addIssue({
				code: "custom",
				path: ["LOCAL_LIVE_EXECUTION"],
				message:
					"LOCAL_LIVE_EXECUTION is only supported with INVESTMADE_DEMO_MODE=true",
			});
		}
		if (env.LOCAL_LIVE_EXECUTION === "true" && env.NODE_ENV === "production") {
			context.addIssue({
				code: "custom",
				path: ["LOCAL_LIVE_EXECUTION"],
				message: "LOCAL_LIVE_EXECUTION must not run in production",
			});
		}
		if (
			(env.LOCAL_LIVE_EXECUTION === "true" ||
				env.INVESTMADE_DEMO_MODE === "false")
		) {
			for (const key of [
				"JUPITER_API_KEY",
				"SOLANA_RPC_URL",
				"SOLANA_WS_URL",
			] as const) {
				if (!env[key]) {
					context.addIssue({
						code: "custom",
						path: [key],
						message: `${key} is required for live execution`,
					});
				}
			}
		}
		if (env.INVESTMADE_DEMO_MODE === "false") {
			for (const key of ["DATABASE_URL", "COINGECKO_API_KEY"] as const) {
				if (!env[key]) {
					context.addIssue({
						code: "custom",
						path: [key],
						message: `${key} is required when INVESTMADE_DEMO_MODE=false`,
					});
				}
			}
		}
		if (
			env.LIVE_BROADCAST_ENABLED === "true" &&
			env.LIVE_PURCHASES_ENABLED !== "true"
		) {
			context.addIssue({
				code: "custom",
				path: ["LIVE_BROADCAST_ENABLED"],
				message: "LIVE_BROADCAST_ENABLED requires LIVE_PURCHASES_ENABLED=true",
			});
		}
	});

export type AppConfig = z.infer<typeof envSchema> & {
	demoMode: boolean;
	localLiveExecution: boolean;
	liveExecution: boolean;
	livePurchasesEnabled: boolean;
	liveBroadcastEnabled: boolean;
};

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
	const parsed = envSchema.parse(source);
	const demoMode = parsed.INVESTMADE_DEMO_MODE === "true";
	const localLiveExecution = parsed.LOCAL_LIVE_EXECUTION === "true";
	return {
		...parsed,
		demoMode,
		localLiveExecution,
		liveExecution: localLiveExecution || !demoMode,
		livePurchasesEnabled: parsed.LIVE_PURCHASES_ENABLED === "true",
		liveBroadcastEnabled: parsed.LIVE_BROADCAST_ENABLED === "true",
	};
}
