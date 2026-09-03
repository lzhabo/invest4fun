import { assetDisplayName } from "../../domain/asset-display";
import type { Candidate, OnboardingPreferences } from "../../domain/schemas";
import { formatTicketSizeUsd } from "../../domain/schemas";
import { AssetMark } from "./AssetMark";
import { Close } from "./Icons";

export function BudgetSummary({
	selectedCount,
	ticketSizeUsd,
	periodLimitUsd,
	cadence,
	className = "",
}: {
	selectedCount: number;
	ticketSizeUsd: number;
	periodLimitUsd: number;
	cadence: OnboardingPreferences["cadence"];
	className?: string;
}) {
	const remaining = Math.max(
		0,
		Math.round((periodLimitUsd - selectedCount * ticketSizeUsd) * 100) / 100,
	);
	const remainingPercent =
		periodLimitUsd > 0 ? (remaining / periodLimitUsd) * 100 : 0;
	const periodLabel =
		cadence === "daily"
			? "Today"
			: cadence === "weekly"
				? "This week"
				: "This month";

	return (
		<div className={`rail-budget${className ? ` ${className}` : ""}`}>
			<span>
				{periodLabel} limit: <strong>{formatTicketSizeUsd(remaining)}</strong>{" "}
				USDC left
			</span>
			<span
				className="rail-budget-progress"
				role="progressbar"
				aria-label={`${periodLabel} budget left`}
				aria-valuemin={0}
				aria-valuemax={periodLimitUsd}
				aria-valuenow={remaining}
			>
				<i style={{ width: `${remainingPercent}%` }} />
			</span>
		</div>
	);
}

export function BudgetRail({
	selected,
	onRemove,
	ticketSizeUsd,
	periodLimitUsd,
	cadence,
}: {
	selected: Candidate[];
	onRemove: (assetId: string) => void;
	ticketSizeUsd: number;
	periodLimitUsd: number;
	cadence: OnboardingPreferences["cadence"];
}) {
	return (
		<aside className="budget-rail" aria-label="Basket and providers">
			<BudgetSummary
				selectedCount={selected.length}
				ticketSizeUsd={ticketSizeUsd}
				periodLimitUsd={periodLimitUsd}
				cadence={cadence}
			/>
			<div className="budget-meta">
				<span className="quote-provider">
					Quotes execution: <i aria-hidden="true" /> Jupiter
				</span>
				<span className="network-line">
					Chain: <i aria-hidden="true" /> Solana
				</span>
			</div>
			{selected.length ? (
				<>
					<div className="basket-head">
						<h3>Your basket</h3>
						<span>{selected.length} assets</span>
					</div>
					<div className="basket-list">
						{selected.map((candidate) => (
							<div className="basket-row" key={candidate.assetId}>
								<AssetMark
									assetId={candidate.assetId}
									symbol={candidate.symbol}
									iconUrl={candidate.iconUrl}
									size="sm"
									decorative
								/>
								<span className="basket-name">
									<strong>{candidate.symbol}</strong>
									<small>{assetDisplayName(candidate.name)}</small>
								</span>
								<span className="basket-amount">
									<strong>{formatTicketSizeUsd(ticketSizeUsd)}</strong>
									<small>USDC</small>
								</span>
								<button
									type="button"
									onClick={() => onRemove(candidate.assetId)}
									aria-label={`Remove ${candidate.symbol}`}
								>
									<Close />
								</button>
							</div>
						))}
					</div>
				</>
			) : null}
		</aside>
	);
}
