export const PERIOD_BUDGET = 100_000_000n;
export const DEFAULT_SLOT_BUDGET = 10_000_000n;
/** Candidate discovery page size. This limits request latency, not basket size. */
export const FEED_PAGE_SIZE = 10;
/** Quote-free Solana universe sent to ranking before exact route validation. */
export const AI_RANKING_POOL_SIZE = 60;
export const MAX_SLIPPAGE_BPS = 50;
export const MAX_PRICE_IMPACT_BPS = 100;
export const QUOTE_TTL_SECONDS = 60;
export const POLICY_VERSION = "investmade-policy/v1";

/** Stable CoinGecko IDs; arbitrary Solana tokens resolve by mint at runtime. */
export const COINGECKO_COIN_IDS: Record<string, string> = {
	ETH: "ethereum",
	WETH: "ethereum",
	SOL: "solana",
	JUP: "jupiter-exchange-solana",
	USDC: "usd-coin",
	AAPLX: "apple-xstock",
	NVDAX: "nvidia-xstock",
	TSLAX: "tesla-xstock",
};

export type RegistryAsset = {
	assetId: string;
	symbol: string;
	name: string;
	kind: "CRYPTO" | "STOCK_TOKEN";
	address: string;
	decimals: number;
	coingeckoId?: string;
};
