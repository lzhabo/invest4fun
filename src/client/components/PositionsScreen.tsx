import { ChevronRight, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { assetDisplayName } from "../../domain/asset-display";
import type { Candidate } from "../../domain/schemas";
import { api } from "../api";
import { selectPortfolioHoldings } from "../portfolio";
import { AssetMark } from "./AssetMark";
import { PortfolioPageSkeleton } from "./PageSkeletons";

const usdFormatter = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	maximumFractionDigits: 2,
});

export function PositionsScreen({
	candidates,
	wallet,
	demoMode,
	showBuildBasket,
	onBuildAnotherBasket,
}: {
	candidates: Candidate[];
	wallet: string;
	demoMode: boolean;
	showBuildBasket: boolean;
	onBuildAnotherBasket: () => Promise<void>;
}) {
	const [balances, setBalances] = useState<Record<string, string>>({});
	const [indexedPortfolio, setIndexedPortfolio] = useState<Candidate[]>([]);
	const [iconSources, setIconSources] = useState<Record<string, string[]>>({});
	const [portfolioLoading, setPortfolioLoading] = useState(
		!demoMode && Boolean(wallet),
	);
	const [error, setError] = useState("");

	useEffect(() => {
		if (demoMode || !wallet) return;
		let cancelled = false;
		setPortfolioLoading(true);
		setError("");
		setIndexedPortfolio([]);
		setBalances({});
		setIconSources({});
		api
			.solanaPortfolio(wallet)
			.then((portfolio) => {
				if (cancelled) return;
				const knownByMint = new Map(
					candidates.map((candidate) => [candidate.contract, candidate]),
				);
				const assets = portfolio.tokens.map((token): Candidate => {
					const known = knownByMint.get(token.mint);
					return known
						? {
								...known,
								assetId: token.assetId,
								iconUrl: token.iconUrl ?? known.iconUrl,
								marketPriceUsd: token.priceUsd ?? known.marketPriceUsd,
								marketDataSource: token.priceSource ?? known.marketDataSource,
								marketDataUpdatedAt:
									token.priceUpdatedAt ?? known.marketDataUpdatedAt,
							}
						: {
								chain: "SOLANA",
								assetId: token.assetId,
								symbol: token.symbol,
								name: token.name,
								kind: "CRYPTO",
								contract: token.mint,
								decimals: token.decimals,
								eligible: true,
								marketHealthy: true,
								permissionAllowed: true,
								marketPriceUsd: token.priceUsd,
								marketDataSource: token.priceSource,
								marketDataUpdatedAt: token.priceUpdatedAt,
								iconUrl: token.iconUrl,
								primaryClassification: "UNKNOWN",
								classificationConfidence: "LOW",
								tags: [],
								riskFlags: [],
								classificationEvidence: ["Alchemy wallet portfolio"],
								crowdScoreBps: 0,
								reason: "Detected in the connected wallet by Alchemy.",
								evidenceIds: ["alchemy-portfolio"],
							};
				});
				setIndexedPortfolio(assets);
				setBalances(
					Object.fromEntries(
						portfolio.tokens.map((token) => [
							token.assetId,
							token.balanceBaseUnits,
						]),
					),
				);
				setIconSources(
					Object.fromEntries(
						portfolio.tokens.map((token) => [
							token.assetId,
							token.iconUrls ?? (token.iconUrl ? [token.iconUrl] : []),
						]),
					),
				);
			})
			.catch((caught) => {
				if (!cancelled) {
					setError(
						caught instanceof Error
							? caught.message
							: "Could not read Solana balances.",
					);
				}
			})
			.finally(() => {
				if (!cancelled) setPortfolioLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [candidates, demoMode, wallet]);

	const holdings = selectPortfolioHoldings(indexedPortfolio, balances);
	const portfolioValueUsd = holdings.reduce(
		(total, candidate) =>
			total +
			(Number(balances[candidate.assetId] ?? "0") / 10 ** candidate.decimals) *
				Number(candidate.marketPriceUsd ?? candidate.quote?.unitPriceUsd ?? 0),
		0,
	);

	if (portfolioLoading) return <PortfolioPageSkeleton />;

	return (
		<main className="positions-page">
			<header className="page-heading positions-heading">
				<div>
					<h1>Portfolio</h1>
					<p>
						Read-only wallet balances from Alchemy. USD prices are shown when
						available.
					</p>
				</div>
			</header>
			<section className="portfolio-summary">
				<div className="portfolio-summary-meta">
					<span>Portfolio value</span>
					<div className="portfolio-summary-value-row">
						<strong>{usdFormatter.format(portfolioValueUsd)}</strong>
					</div>
				</div>
			</section>
			{showBuildBasket ? (
				<button
					type="button"
					className="build-basket-button"
					onClick={() => void onBuildAnotherBasket()}
				>
					<span className="account-row-icon account-row-icon-acid">
						<Plus aria-hidden="true" />
					</span>
					<div>
						<strong>Build another basket</strong>
						<small>Create a new basket from your feed</small>
					</div>
					<ChevronRight aria-hidden="true" />
				</button>
			) : null}
			{demoMode ? (
				<div className="positions-empty">
					Demo mode does not invent wallet balances. Start live mode with a
					funded wallet to view holdings.
				</div>
			) : holdings.length === 0 ? (
				<div className="positions-empty" role="status" aria-live="polite">
					<strong>No positions yet</strong>
					<span>
						This wallet has no positive Solana token balances to show.
					</span>
				</div>
			) : (
				<section className="positions-list">
					{holdings.map((candidate) => {
						const rawBalance = balances[candidate.assetId] ?? "0";
						const rawUnitPrice =
							candidate.marketPriceUsd ?? candidate.quote?.unitPriceUsd;
						const holdingValue =
							rawUnitPrice !== undefined
								? usdFormatter.format(
										(Number(rawBalance) / 10 ** candidate.decimals) *
											Number(rawUnitPrice),
									)
								: "Price unavailable";
						const unitPrice =
							rawUnitPrice !== undefined
								? usdFormatter.format(Number(rawUnitPrice))
								: "Price unavailable";
						return (
							<article className="position-row" key={candidate.assetId}>
								<AssetMark
									assetId={candidate.assetId}
									symbol={candidate.symbol}
									iconUrl={candidate.iconUrl}
									iconUrls={iconSources[candidate.assetId]}
									size="sm"
									decorative
								/>
								<div className="position-copy">
									<div className="position-primary">
										{portfolioExplorerUrl(candidate.contract) ? (
											<a
												href={portfolioExplorerUrl(candidate.contract)}
												target="_blank"
												rel="noopener noreferrer"
											>
												{assetDisplayName(candidate.name)} ↗
											</a>
										) : (
											<b>{assetDisplayName(candidate.name)}</b>
										)}
										<b>{holdingValue}</b>
									</div>
									<div className="position-secondary">
										<small>{unitPrice}</small>
										<small>
											{formatPositionBalance(
												BigInt(rawBalance),
												candidate.decimals,
											)}{" "}
											{candidate.symbol}
										</small>
									</div>
								</div>
							</article>
						);
					})}
				</section>
			)}
			{error && (
				<p className="error-message" role="alert">
					{error}
				</p>
			)}
		</main>
	);
}

function formatPositionBalance(value: bigint, decimals: number) {
	const formatted = formatUnits(value, decimals);
	const [whole, fraction = ""] = formatted.split(".");
	const firstNonZero = fraction.search(/[1-9]/);
	const visibleDecimals =
		value > 0n && whole === "0" && firstNonZero >= 4
			? Math.min(fraction.length, firstNonZero + 2)
			: 4;
	const compactFraction = fraction.slice(0, visibleDecimals).replace(/0+$/, "");
	return compactFraction ? `${whole}.${compactFraction}` : whole;
}

function portfolioExplorerUrl(mint: string) {
	return mint ? `https://solscan.io/token/${encodeURIComponent(mint)}` : "";
}
