/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_SENTRY_DSN?: string;
	readonly VITE_SENTRY_ENVIRONMENT?: string;
	readonly VITE_SENTRY_RELEASE?: string;
	readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
	readonly VITE_SENTRY_REPLAY_SESSION_SAMPLE_RATE?: string;
	readonly VITE_SENTRY_REPLAY_ERROR_SAMPLE_RATE?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
