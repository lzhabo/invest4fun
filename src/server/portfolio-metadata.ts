import { z } from "zod";
import type { Candidate } from "../domain/schemas.js";
import type { StateStore } from "./store.js";

const portfolioMetadataSchema = z.object({
	assetId: z.string().min(1),
	mint: z.string().min(1),
	symbol: z.string().min(1),
	name: z.string().min(1),
	decimals: z.number().int().min(0).max(36),
	iconUrl: z.string().url().optional(),
});

export type PortfolioMetadata = z.infer<typeof portfolioMetadataSchema>;

export function portfolioMetadataCacheKey(mint: string) {
	return `portfolio-token:${mint}`;
}

export async function loadPortfolioMetadata(
	store: StateStore,
	mint: string,
): Promise<PortfolioMetadata | undefined> {
	try {
		const snapshot = await store.getProviderSnapshot(
			portfolioMetadataCacheKey(mint),
		);
		const parsed = portfolioMetadataSchema.safeParse(snapshot?.value);
		return parsed.success ? parsed.data : undefined;
	} catch {
		return undefined;
	}
}

export async function persistPortfolioMetadata(
	store: StateStore,
	candidates: Candidate[],
) {
	const expiresAt = new Date();
	expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 10);
	await Promise.all(
		candidates.map((candidate) =>
			store.setProviderSnapshot(
				portfolioMetadataCacheKey(candidate.contract),
				"execution",
				{
					assetId: candidate.assetId,
					mint: candidate.contract,
					symbol: candidate.symbol,
					name: candidate.name,
					decimals: candidate.decimals,
					iconUrl: candidate.iconUrl,
				},
				expiresAt.toISOString(),
			),
		),
	);
}

export function portfolioTokenFallbackName(mint: string) {
	return `Token ${shortMint(mint)}`;
}

function shortMint(mint: string) {
	return mint.length > 14 ? `${mint.slice(0, 7)}…${mint.slice(-5)}` : mint;
}
