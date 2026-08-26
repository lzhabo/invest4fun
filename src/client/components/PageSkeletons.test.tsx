import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	AccountBalanceSkeleton,
	AppBootstrapSkeleton,
	PortfolioPageSkeleton,
	ReviewPageSkeleton,
} from "./PageSkeletons";

describe("page loading skeletons", () => {
	it("renders the standalone bootstrap shell with the reference card skeleton", () => {
		const html = renderToStaticMarkup(<AppBootstrapSkeleton />);

		expect(html).toContain('class="app-bootstrap-skeleton"');
		expect(html).toContain('class="swipe-card feed-card-skeleton"');
		expect(html).toContain(
			'class="allocation-stamp allocation-amount-editor feed-skeleton-amount"',
		);
		const amountSkeleton = html.match(
			/<div class="allocation-stamp allocation-amount-editor feed-skeleton-amount">([\s\S]*?)<\/div>/,
		)?.[1];
		expect(amountSkeleton).toContain("feed-skeleton-block");
		expect(amountSkeleton).not.toContain("$");
		expect(amountSkeleton).not.toContain("<svg");
		expect(html).toContain("Loading invest4.fun");
	});

	it("renders adaptive page-shaped portfolio and review placeholders", () => {
		const portfolio = renderToStaticMarkup(<PortfolioPageSkeleton />);
		const review = renderToStaticMarkup(<ReviewPageSkeleton />);

		expect(portfolio).toContain('class="positions-page page-skeleton');
		expect(portfolio).toContain("Loading wallet holdings");
		expect(portfolio.match(/page-skeleton-position-row/g)).toHaveLength(4);
		expect(review).toContain('class="review-page page-skeleton');
		expect(review).toContain("Preparing your basket");
		expect(review.match(/page-skeleton-review-row/g)).toHaveLength(4);
	});

	it("keeps the Account page usable while only its balance is loading", () => {
		const html = renderToStaticMarkup(<AccountBalanceSkeleton />);

		expect(html).toContain('class="account-balance-skeleton"');
		expect(html).toContain('aria-label="Loading investing balance"');
	});
});
