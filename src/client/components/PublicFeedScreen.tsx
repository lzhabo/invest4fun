import { ArrowLeft, ArrowRight, ChevronLeft, LogIn } from "lucide-react";
import { useState } from "react";
import { DEFAULT_PUBLIC_FEED_CANDIDATES } from "../public-feed";
import { SwipeCard } from "./SwipeCard";

export function PublicFeedScreen({
	onSignIn,
	signInReady,
}: {
	onSignIn: () => void;
	signInReady: boolean;
}) {
	const [index, setIndex] = useState(0);
	const [ticketSizeUsd, setTicketSizeUsd] = useState(1);
	const [infoOpen, setInfoOpen] = useState(false);
	const current = DEFAULT_PUBLIC_FEED_CANDIDATES[index];

	function skip() {
		setInfoOpen(false);
		setIndex((currentIndex) =>
			(currentIndex + 1) % DEFAULT_PUBLIC_FEED_CANDIDATES.length,
		);
	}

	if (!current) return null;

	return (
		<main className="swipe-page">
			<section className="swipe-workspace public-feed-preview">
				<header className="page-heading feed-page-heading">
					<div>
						<h1>Explore the Solana feed</h1>
						<p>
							Browse the default feed now. Sign in only when you want to add an
							 asset.
						</p>
					</div>
				</header>

				<div className="card-stage">
					<button
						type="button"
						className="gesture gesture-skip"
						onClick={skip}
						aria-label="Skip asset"
					>
						<ArrowLeft aria-hidden="true" />
						<span>
							Skip<small>Next asset</small>
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
						onSwipe={(add) => (add ? onSignIn() : skip())}
					/>
					<button
						type="button"
						className="gesture gesture-add"
						onClick={onSignIn}
						aria-label="Sign in to add asset"
						disabled={!signInReady}
					>
						<ArrowRight aria-hidden="true" />
						<span>
							Sign in<small>to add</small>
						</span>
					</button>
				</div>

				<p className="public-feed-position" aria-live="polite">
					{index + 1} of {DEFAULT_PUBLIC_FEED_CANDIDATES.length} default assets
				</p>
				<div className="card-actions public-feed-actions">
					<button type="button" className="button button-skip" onClick={skip}>
						<ChevronLeft aria-hidden="true" /> Skip
					</button>
					<button
						type="button"
						className="button button-primary"
						onClick={onSignIn}
						disabled={!signInReady}
					>
						<LogIn aria-hidden="true" />
						{signInReady ? "Sign in to add" : "Loading wallet…"}
					</button>
				</div>
			</section>
		</main>
	);
}
