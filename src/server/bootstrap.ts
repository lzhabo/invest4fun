import { CoinGeckoIconProvider } from "./adapters/coingecko.js";
import { DeterministicRanker } from "./adapters/deterministic-ranker.js";
import {
	SolanaDemoCandidateProvider,
	SolanaDemoExecutionProvider,
} from "./adapters/solana-demo.js";
import { JupiterProvider } from "./adapters/jupiter.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { PostgresStateStore } from "./postgres-store.js";
import { MemoryStateStore } from "./store.js";

export function createServerApp() {
	const config = loadConfig();
	const solanaDemo = new SolanaDemoCandidateProvider();
	const solanaDemoJupiter = new SolanaDemoExecutionProvider("JUPITER");
	const deterministic = new DeterministicRanker();
	const required = (value: string | undefined, name: string) => {
		if (!value) throw new Error(`${name}_REQUIRED`);
		return value;
	};
	const store = config.demoMode
		? new MemoryStateStore()
		: new PostgresStateStore(required(config.DATABASE_URL, "DATABASE_URL"));
	const coinGecko = new CoinGeckoIconProvider(
		config.COINGECKO_API_KEY,
		fetch,
		store,
	);
	let jupiterProvider: JupiterProvider | undefined;
	if (
		config.liveExecution &&
		config.JUPITER_API_KEY &&
		config.SOLANA_RPC_URL &&
		config.SOLANA_WS_URL
	) {
		jupiterProvider = new JupiterProvider(
			config.JUPITER_API_KEY,
			config.SOLANA_RPC_URL,
			fetch,
			store,
		);
	}
	const defaultExecution = jupiterProvider ?? solanaDemoJupiter;
	const defaultCandidates = jupiterProvider ?? solanaDemo;

	return createApp({
		config,
		store,
		candidates: defaultCandidates,
		inference: deterministic,
		rankingProviders: {
			DETERMINISTIC: deterministic,
		},
		execution: defaultExecution,
		solanaExecutionProviders: { JUPITER: defaultExecution },
		solanaCandidateProviders: { JUPITER: defaultCandidates },
		icons: config.liveExecution ? coinGecko : undefined,
		marketData: config.liveExecution ? coinGecko : undefined,
		history: config.liveExecution ? coinGecko : undefined,
	});
}
