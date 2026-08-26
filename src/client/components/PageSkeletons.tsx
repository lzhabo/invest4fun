import { FeedCardSkeleton } from "./FeedCardSkeleton";

const PORTFOLIO_ROWS = ["one", "two", "three", "four"] as const;
const REVIEW_ROWS = ["one", "two", "three", "four"] as const;
const POLICY_ROWS = ["one", "two", "three", "four", "five"] as const;

function SkeletonBlock({ className = "" }: { className?: string }) {
	return <span className={`page-skeleton-block ${className}`.trim()} />;
}

export function AppBootstrapSkeleton() {
	return (
		<div className="app-bootstrap-skeleton" aria-busy="true">
			<span className="sr-only" role="status">
				Loading invest4.fun
			</span>
			<div className="app-bootstrap-topbar" aria-hidden="true">
				<SkeletonBlock className="app-bootstrap-logo" />
				<div className="app-bootstrap-nav">
					<SkeletonBlock />
					<SkeletonBlock />
					<SkeletonBlock />
					<SkeletonBlock />
				</div>
			</div>
			<main className="app-bootstrap-main">
				<div className="app-bootstrap-heading" aria-hidden="true">
					<SkeletonBlock />
					<SkeletonBlock />
				</div>
				<FeedCardSkeleton message="Loading invest4.fun…" />
			</main>
		</div>
	);
}

export function PortfolioPageSkeleton() {
	return (
		<main
			className="positions-page page-skeleton page-skeleton-portfolio"
			aria-busy="true"
			aria-live="polite"
		>
			<span className="sr-only" role="status">
				Loading wallet holdings
			</span>
			<div
				className="positions-heading page-skeleton-heading"
				aria-hidden="true"
			>
				<div>
					<SkeletonBlock className="page-skeleton-title" />
					<SkeletonBlock className="page-skeleton-copy" />
				</div>
			</div>
			<div
				className="portfolio-summary page-skeleton-summary"
				aria-hidden="true"
			>
				<div className="portfolio-summary-meta">
					<SkeletonBlock className="page-skeleton-label" />
					<div className="portfolio-summary-value-row">
						<SkeletonBlock className="page-skeleton-value" />
						<SkeletonBlock className="page-skeleton-button" />
					</div>
				</div>
			</div>
			<div className="positions-list page-skeleton-list" aria-hidden="true">
				{PORTFOLIO_ROWS.map((row, index) => (
					<div className="page-skeleton-position-row" key={row}>
						<SkeletonBlock className="page-skeleton-avatar-sm" />
						<div className="page-skeleton-position-copy">
							<SkeletonBlock className={index % 2 ? "is-medium" : "is-wide"} />
							<SkeletonBlock className="is-short" />
						</div>
						<div className="page-skeleton-position-value">
							<SkeletonBlock className="is-short" />
							<SkeletonBlock className="is-medium" />
						</div>
						<SkeletonBlock className="page-skeleton-action" />
					</div>
				))}
			</div>
		</main>
	);
}

export function ReviewPageSkeleton() {
	return (
		<main
			className="review-page page-skeleton page-skeleton-review"
			aria-busy="true"
			aria-live="polite"
		>
			<span className="sr-only" role="status">
				Preparing your basket
			</span>
			<div
				className="review-ledger page-skeleton-review-ledger"
				aria-hidden="true"
			>
				<div className="page-skeleton-review-heading">
					<SkeletonBlock className="page-skeleton-title" />
					<SkeletonBlock className="page-skeleton-copy" />
				</div>
				<div className="page-skeleton-review-table">
					{REVIEW_ROWS.map((row, index) => (
						<div className="page-skeleton-review-row" key={row}>
							<SkeletonBlock className="page-skeleton-avatar-sm" />
							<div>
								<SkeletonBlock
									className={index % 2 ? "is-medium" : "is-wide"}
								/>
								<SkeletonBlock className="is-short" />
							</div>
							<SkeletonBlock className="page-skeleton-review-amount" />
							<SkeletonBlock className="page-skeleton-review-output" />
							<SkeletonBlock className="page-skeleton-action" />
						</div>
					))}
				</div>
				<div className="page-skeleton-totals">
					<SkeletonBlock />
					<SkeletonBlock />
					<SkeletonBlock />
				</div>
			</div>
			<div className="policy-rail page-skeleton-policy" aria-hidden="true">
				<SkeletonBlock className="page-skeleton-policy-title" />
				{POLICY_ROWS.map((row, index) => (
					<div className="page-skeleton-policy-row" key={row}>
						<SkeletonBlock className="page-skeleton-policy-icon" />
						<SkeletonBlock className={index % 2 ? "is-medium" : "is-wide"} />
					</div>
				))}
				<SkeletonBlock className="page-skeleton-policy-note" />
				<div className="page-skeleton-policy-actions">
					<SkeletonBlock />
					<SkeletonBlock />
				</div>
			</div>
			<div
				className="execution-strip page-skeleton-progress"
				aria-hidden="true"
			>
				<SkeletonBlock className="page-skeleton-progress-title" />
				<SkeletonBlock />
				<SkeletonBlock />
				<SkeletonBlock />
			</div>
		</main>
	);
}

export function AccountBalanceSkeleton() {
	return (
		<span
			className="account-balance-skeleton"
			role="status"
			aria-label="Loading investing balance"
		>
			<SkeletonBlock />
		</span>
	);
}
