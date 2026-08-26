import { ChartLoadingDots } from "./SwipeCard";
import ShinyText from "./ShinyText";

export function FeedCardSkeleton({
	message,
	detail,
}: {
	message: string;
	detail?: string;
}) {
	return (
		<div
			className="feed-skeleton-state"
			role="status"
			aria-live="polite"
			aria-busy="true"
		>
			<article className="swipe-card feed-card-skeleton">
				<div className="card-head" aria-hidden="true">
					<div className="asset-title">
						<span className="feed-skeleton-block feed-skeleton-avatar" />
						<span className="feed-skeleton-name">
							<i className="feed-skeleton-block" />
							<i className="feed-skeleton-block" />
						</span>
					</div>
					<div className="allocation-stamp allocation-amount-editor feed-skeleton-amount">
						<i className="feed-skeleton-block" />
					</div>
				</div>

				<div className="price-chart feed-skeleton-chart">
					<div className="chart-meta" aria-hidden="true">
						<i className="feed-skeleton-block feed-skeleton-price" />
						<i className="feed-skeleton-block feed-skeleton-change" />
					</div>
					<div className="feed-skeleton-plot">
						<ChartLoadingDots decorated />
						<div className="feed-skeleton-status">
							<ShinyText
								text={message}
								speed={2}
								color="var(--skeleton-text)"
								shineColor="var(--skeleton-shine)"
								className="feed-skeleton-message"
							/>
							{detail ? <span>{detail}</span> : null}
						</div>
					</div>
					<div className="chart-controls" aria-hidden="true">
						<div className="chart-timeframes feed-skeleton-timeframes">
							<i className="feed-skeleton-block" />
							<i className="feed-skeleton-block" />
							<i className="feed-skeleton-block" />
							<i className="feed-skeleton-block" />
							<i className="feed-skeleton-block" />
						</div>
						<span className="chart-reason-toggle feed-skeleton-info" />
					</div>
				</div>
			</article>
		</div>
	);
}
