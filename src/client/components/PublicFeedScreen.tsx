import {
	ArrowLeft,
	ArrowRight,
	BaggageClaim,
	ChevronLeft,
	ChevronRight,
	LogIn,
	RotateCcw,
	X,
} from "lucide-react";
import { useState } from "react";
import { formatUnits } from "viem";
import {
	formatTicketSizeUsd,
	ticketSizeToBaseUnits,
} from "../../domain/schemas";
import {
	addPublicFeedBasketItem,
	markPublicFeedRouteCheckPending,
	publicFeedSelections,
	readPublicFeedBasket,
	removePublicFeedBasketItem,
	type PublicFeedBasketItem,
} from "../public-feed-basket";
import { DEFAULT_PUBLIC_FEED_CANDIDATES } from "../public-feed";
import { AssetMark } from "./AssetMark";
import { SwipeCard } from "./SwipeCard";

function browserStorage() {
	return typeof window === "undefined" ? undefined : window.localStorage;
}

function basketTotalUsd(items: PublicFeedBasketItem[]) {
	return Number(
		formatUnits(
			items.reduce(
				(total, item) => total + BigInt(item.amountInBaseUnits),
				0n,
			),
			6,
		),
	);
}

export function PublicFeedScreen({
	onCheckRoutes,
	signInReady,
}: {
	onCheckRoutes: () => void;
	signInReady: boolean;
}) {
	const [index, setIndex] = useState(0);
	const [ticketSizeUsd, setTicketSizeUsd] = useState(1);
	const [infoOpen, setInfoOpen] = useState(false);
	const [reviewing, setReviewing] = useState(false);
	const [basket, setBasket] = useState<PublicFeedBasketItem[]>(() => {
		const storage = browserStorage();
		return storage ? readPublicFeedBasket(storage) : [];
	});
	const current = DEFAULT_PUBLIC_FEED_CANDIDATES[index];
	const selections = publicFeedSelections(basket);

	function advance() {
		setInfoOpen(false);
		setIndex((currentIndex) => currentIndex + 1);
	}

	function addCurrent() {
		if (!current) return;
		const storage = browserStorage();
		const item = {
			assetId: current.assetId,
			amountInBaseUnits: ticketSizeToBaseUnits(ticketSizeUsd).toString(),
		};
		if (storage) {
			setBasket(
				addPublicFeedBasketItem(
					storage,
					item.assetId,
					item.amountInBaseUnits,
				),
			);
		} else {
			setBasket((items) => [
				...items.filter(({ assetId }) => assetId !== item.assetId),
				item,
			]);
		}
		advance();
	}

	function removeAsset(assetId: string) {
		const storage = browserStorage();
		if (storage) setBasket(removePublicFeedBasketItem(storage, assetId));
		else setBasket((items) => items.filter((item) => item.assetId !== assetId));
	}

	function checkRoutes() {
		if (!basket.length) return;
		const storage = browserStorage();
		if (storage) markPublicFeedRouteCheckPending(storage);
		onCheckRoutes();
	}

	if (reviewing) {
		return (
			<main className="guest-basket-page">
				<section className="guest-basket-card">
					<header>
						<p className="eyebrow">Guest basket</p>
						<h1>Review your basket</h1>
						<p>
							Edit the basket now. Sign in only when you are ready to check live
							 Jupiter routes.
						</p>
					</header>

					{selections.length ? (
						<div className="guest-basket-list">
							{selections.map(({ candidate, amountInBaseUnits }) => (
								<div className="guest-basket-row" key={candidate.assetId}>
									<AssetMark
										assetId={candidate.assetId}
										symbol={candidate.symbol}
										iconUrl={candidate.iconUrl}
										decorative
									/>
									<span>
										<strong>{candidate.symbol}</strong>
										<small>{candidate.name}</small>
									</span>
									<b>
										{formatTicketSizeUsd(
											Number(formatUnits(BigInt(amountInBaseUnits), 6)),
										)}{" "}
										USDC
									</b>
									<button
										type="button"
										onClick={() => removeAsset(candidate.assetId)}
										aria-label={`Remove ${candidate.symbol}`}
									>
										<X aria-hidden="true" />
									</button>
								</div>
							))}
						</div>
					) : (
						<div className="guest-basket-empty">
							<h2>Your basket is empty</h2>
							<p>Add an asset from the feed before checking routes.</p>
						</div>
					)}

					<div className="guest-basket-summary">
						<span>Total</span>
						<strong>{formatTicketSizeUsd(basketTotalUsd(basket))} USDC</strong>
					</div>
					<p className="guest-route-note">
						Route checking does not buy anything. You will review fresh quotes and
						 confirm the purchase separately.
					</p>
					<div className="guest-basket-actions">
						<button
							type="button"
							className="button button-outline"
							onClick={() => setReviewing(false)}
						>
							<ChevronLeft aria-hidden="true" /> Back to feed
						</button>
						<button
							type="button"
							className="button button-primary"
							onClick={checkRoutes}
							disabled={!basket.length || !signInReady}
						>
							<LogIn aria-hidden="true" />
							{signInReady ? "Sign in & check routes" : "Loading wallet…"}
						</button>
					</div>
				</section>
			</main>
		);
	}

	return (
		<main className="swipe-page">
			<section className="swipe-workspace public-feed-preview">
				<header className="page-heading feed-page-heading">
					<div>
						<h1>Explore the Solana feed</h1>
						<p>
							Swipe and build a basket without an account. Sign in only to check
							 live routes and buy.
						</p>
					</div>
				</header>

				{current ? (
					<>
						<div className="card-stage">
							<button
								type="button"
								className="gesture gesture-skip"
								onClick={advance}
								aria-label="Skip asset"
							>
								<ArrowLeft aria-hidden="true" />
								<span>
									Skip<small>Swipe left</small>
								</span>
							</button>
							<SwipeCard
								candidate={current}
								reason={current.reason}
								ticketSizeUsd={ticketSizeUsd}
								stableToken="USDC"
								infoOpen={infoOpen}
								onInfoOpenChange={setInfoOpen}
								onTicketSizeChange={setTicketSizeUsd}
								onSwipe={(add) => (add ? addCurrent() : advance())}
							/>
							<button
								type="button"
								className="gesture gesture-add"
								onClick={addCurrent}
								aria-label={`Add ${current.symbol} to basket`}
							>
								<ArrowRight aria-hidden="true" />
								<span>
									Add<small>Swipe right</small>
								</span>
							</button>
						</div>
						<p className="public-feed-position" aria-live="polite">
							{index + 1} of {DEFAULT_PUBLIC_FEED_CANDIDATES.length} default assets
						</p>
						<div className={`card-actions${basket.length ? " has-selection" : ""}`}>
							<button type="button" className="button button-skip" onClick={advance}>
								<ChevronLeft aria-hidden="true" /> Skip
							</button>
							<button
								type="button"
								className="button button-outline"
								onClick={() => setReviewing(true)}
								disabled={!basket.length}
							>
								Review basket ({basket.length}) <BaggageClaim aria-hidden="true" />
							</button>
							<button
								type="button"
								className="button button-primary"
								onClick={addCurrent}
							>
								Add {formatTicketSizeUsd(ticketSizeUsd)} USDC <ChevronRight aria-hidden="true" />
							</button>
						</div>
					</>
				) : (
					<div className="feed-complete public-feed-complete">
						<h2>You reached the end of the default feed.</h2>
						<p>
							{basket.length
								? `${basket.length} asset${basket.length === 1 ? " is" : "s are"} ready to review.`
								: "You skipped every asset. Nothing was added."}
						</p>
						<button
							type="button"
							className="button button-primary"
							onClick={() => setReviewing(true)}
							disabled={!basket.length}
						>
							Review basket ({basket.length}) <BaggageClaim aria-hidden="true" />
						</button>
						<button
							type="button"
							className="button button-outline"
							onClick={() => setIndex(0)}
						>
							<RotateCcw aria-hidden="true" /> Start over
						</button>
					</div>
				)}
			</section>
		</main>
	);
}
