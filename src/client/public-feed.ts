import type { Candidate } from "../domain/schemas.js";
import { SOLANA_ASSET_REGISTRY } from "../domain/solana.js";

const PUBLIC_FEED_REASONS: Record<string, string> = {
	SOL: "The native asset of Solana and the network's broadest ecosystem exposure.",
	JUP: "Jupiter powers swap routing and liquidity discovery across Solana.",
	AAPLX: "Tokenized Apple exposure issued on Solana.",
	NVDAX: "Tokenized NVIDIA exposure issued on Solana.",
	TSLAX: "Tokenized Tesla exposure issued on Solana.",
};

export const DEFAULT_PUBLIC_FEED_CANDIDATES: Candidate[] = [
	"SOL",
	"JUP",
	"AAPLX",
	"NVDAX",
	"TSLAX",
].map((symbol, index) => {
	const asset = SOLANA_ASSET_REGISTRY[symbol];
	if (!asset) throw new Error(`Missing public feed asset: ${symbol}`);
	return {
		chain: "SOLANA",
		assetId: asset.assetId,
		symbol: asset.symbol,
		name: asset.name,
		kind: asset.kind,
		contract: asset.address,
		decimals: asset.decimals,
		...(asset.iconUrl ? { iconUrl: asset.iconUrl } : {}),
		eligible: true,
		marketHealthy: true,
		permissionAllowed: true,
		crowdScoreBps: 8_800 - index * 350,
		reason:
			PUBLIC_FEED_REASONS[symbol] ??
			`${asset.name} is available to explore on Solana.`,
		evidenceIds: [`public-solana-catalog:${asset.assetId}`],
	};
});
