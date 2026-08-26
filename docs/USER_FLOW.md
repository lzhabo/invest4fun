# User flow

1. The user signs in with Privy and selects a Solana wallet.
2. Onboarding records cadence, period limit, per-card USDC amount, risk preference, and asset classes.
3. The backend opens a Solana session and returns a ranked feed.
4. Swiping adds or skips assets; no funds move.
5. Review refreshes exact Jupiter or 0x routes and prepares the Solana transaction.
6. The user signs with the same Solana wallet used to open the session.
7. The backend submits and reconciles the transaction, then shows a receipt.
8. Portfolio reads Solana balances and can prepare individual exits to USDC. Bulk exit keeps native SOL for fees and submits token exits sequentially.

## Top-up

Account offers two Solana funding paths:

- copy the wallet address and transfer USDC directly;
- use Blink when merchant configuration is available.

Blink is a deposit/payment interface. It creates a top-up flow for the user’s Solana wallet; it is separate from trade execution and never grants an investing mandate.

## Safety rules

- The backend accepts only Solana preferences and new sessions.
- Only Jupiter and 0x Solana execution providers are selectable.
- Quotes must be fresh and within the configured price-impact limit.
- Asset IDs must match a curated Solana asset or a canonical mint-derived ID.
- A prepared plan is bound to the wallet, session, selections, amounts, and slippage.
- The backend never signs on behalf of the user.
- Legacy execution rows are read-only.
