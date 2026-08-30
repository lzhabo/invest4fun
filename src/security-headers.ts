export const CONTENT_SECURITY_POLICY_DIRECTIVES: Record<string, string[]> = {
	defaultSrc: ["'self'"],
	scriptSrc: [
		"'self'",
		"'wasm-unsafe-eval'",
		"https://challenges.cloudflare.com",
		"https://va.vercel-scripts.com",
	],
	styleSrc: ["'self'", "'unsafe-inline'"],
	imgSrc: ["'self'", "data:", "blob:", "https:"],
	fontSrc: ["'self'", "data:"],
	objectSrc: ["'none'"],
	baseUri: ["'self'"],
	formAction: ["'self'"],
	frameAncestors: ["'none'"],
	childSrc: [
		"https://auth.privy.io",
		"https://verify.walletconnect.com",
		"https://verify.walletconnect.org",
	],
	frameSrc: [
		"https://auth.privy.io",
		"https://verify.walletconnect.com",
		"https://verify.walletconnect.org",
		"https://challenges.cloudflare.com",
	],
	connectSrc: [
		"'self'",
		"https://auth.privy.io",
		"https://*.rpc.privy.systems",
		"https://*.g.alchemy.com",
		"https://explorer-api.walletconnect.com",
		"https://api.mainnet-beta.solana.com",
		"https://*.ingest.sentry.io",
		"https://*.ingest.us.sentry.io",
		"https://vitals.vercel-insights.com",
		"wss://api.mainnet-beta.solana.com",
		"wss://relay.walletconnect.com",
		"wss://relay.walletconnect.org",
		"wss://www.walletlink.org",
	],
	workerSrc: ["'self'"],
	manifestSrc: ["'self'"],
};

export function contentSecurityPolicyHeader(development = false) {
	const directives = development
		? {
				...CONTENT_SECURITY_POLICY_DIRECTIVES,
				scriptSrc: [
					...(CONTENT_SECURITY_POLICY_DIRECTIVES.scriptSrc ?? []),
					"'unsafe-inline'",
				],
				connectSrc: [
					...(CONTENT_SECURITY_POLICY_DIRECTIVES.connectSrc ?? []),
					"ws://localhost:5173",
				],
			}
		: CONTENT_SECURITY_POLICY_DIRECTIVES;

	return Object.entries(directives)
		.map(([directive, sources]) => {
			const name = directive.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
			return `${name} ${sources.join(" ")}`;
		})
		.join("; ");
}
