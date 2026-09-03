import {
	SOLANA_ASSET_REGISTRY,
	type SolanaAsset,
} from "../../domain/solana.js";
import { assetDisplayName } from "../../domain/asset-display.js";

const XSTOCKS_CATALOG_URL = "https://api.backed.fi/api/v1/token";
const CATALOG_TTL_MS = 5 * 60_000;

type XStocksToken = {
	name?: unknown;
	symbol?: unknown;
	isTradingHalted?: unknown;
	deployments?: unknown;
};

type XStocksCatalogResponse = {
	nodes?: unknown;
};

export interface XStocksCatalogSource {
	assets(): Promise<SolanaAsset[]>;
}

export class XStocksCatalogService implements XStocksCatalogSource {
	private cached?: { expiresAt: number; assets: SolanaAsset[] };

	constructor(private readonly fetcher: typeof fetch = fetch) {}

	async assets(): Promise<SolanaAsset[]> {
		if (this.cached && Date.now() < this.cached.expiresAt) {
			return this.cached.assets;
		}
		try {
			const response = await this.fetcher(XSTOCKS_CATALOG_URL, {
				headers: { Accept: "application/json" },
			});
			if (!response.ok) throw new Error(`XSTOCKS_CATALOG_${response.status}`);
			const body = (await response.json()) as XStocksCatalogResponse;
			const assets = Array.isArray(body.nodes)
				? body.nodes.flatMap((node) => xStockFromApi(node as XStocksToken))
				: [];
			if (!assets.length) throw new Error("XSTOCKS_CATALOG_EMPTY");
			this.cached = { expiresAt: Date.now() + CATALOG_TTL_MS, assets };
			return assets;
		} catch {
			if (this.cached) return this.cached.assets;
			return Object.values(SOLANA_ASSET_REGISTRY).filter(
				(asset) => asset.kind === "STOCK_TOKEN",
			);
		}
	}
}

function xStockFromApi(token: XStocksToken): SolanaAsset[] {
	if (
		token.isTradingHalted === true ||
		typeof token.name !== "string" ||
		typeof token.symbol !== "string" ||
		!Array.isArray(token.deployments)
	) {
		return [];
	}
	const deployment = token.deployments.find(
		(item): item is { network: string; address: string } =>
			typeof item === "object" &&
			item !== null &&
			(item as { network?: unknown }).network === "Solana" &&
			typeof (item as { address?: unknown }).address === "string",
	);
	const mint = deployment?.address.replace(/^svm:/, "");
	if (!mint) return [];
	return [
		{
			assetId: `sol:mainnet:${mint}`,
			symbol: token.symbol,
			name: assetDisplayName(token.name),
			kind: "STOCK_TOKEN",
			category: categoryFromName(token.name),
			address: mint,
			decimals: 8,
		},
	];
}

function categoryFromName(name: string): NonNullable<SolanaAsset["category"]> {
	if (/gold|silver|uranium|oil|commodity|palladium|platinum/i.test(name)) {
		return "COMMODITY";
	}
	if (/\betf\b|fund|trust|shares|index/i.test(name)) return "ETF";
	return "STOCK";
}
