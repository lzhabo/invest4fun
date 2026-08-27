import type { ExecutionPlan } from "../domain/schemas.js";
import type { UserAccount, WeeklySession } from "./store.js";

export class LivePurchaseSafetyError extends Error {
	constructor(
		public readonly code:
			| "EXECUTION_NOT_FOUND"
			| "CANONICAL_WALLET_REQUIRED"
			| "QUOTE_EXPIRED",
		message: string,
	) {
		super(message);
		this.name = "LivePurchaseSafetyError";
	}
}

/**
 * Binds a live execution to the Privy user and the one embedded wallet that was
 * recorded when their InvestMade account was bootstrapped. External wallets
 * may fund this wallet, but they cannot become execution signers.
 */
export function assertCanonicalExecutionOwner(input: {
	account: UserAccount | undefined;
	actorUserId: string;
	actorWallet: string;
	session?: WeeklySession;
}): void {
	const { account, actorUserId, actorWallet, session } = input;
	if (!account || account.privyUserId.toLowerCase() !== actorUserId.toLowerCase()) {
		throw new LivePurchaseSafetyError(
			"EXECUTION_NOT_FOUND",
			"The live execution account could not be found.",
		);
	}
	if (account.canonicalSolanaWallet !== actorWallet) {
		throw new LivePurchaseSafetyError(
			"CANONICAL_WALLET_REQUIRED",
			"Live purchases must be signed by the account's embedded Solana wallet.",
		);
	}
	if (
		session &&
		(session.ownerId.toLowerCase() !== actorUserId.toLowerCase() ||
			session.wallet !== account.canonicalSolanaWallet)
	) {
		throw new LivePurchaseSafetyError(
			"EXECUTION_NOT_FOUND",
			"The live execution could not be found.",
		);
	}
}

/** Fail closed before accepting a signed payload for a stale Jupiter plan. */
export function assertPlanQuotesFresh(
	plan: Pick<ExecutionPlan, "quotes">,
	now = new Date(),
): void {
	const nowMs = now.getTime();
	if (
		!plan.quotes.length ||
		plan.quotes.some((quote) => {
			const expiresAt = Date.parse(quote.expiresAt);
			return !Number.isFinite(expiresAt) || expiresAt <= nowMs;
		})
	) {
		throw new LivePurchaseSafetyError(
			"QUOTE_EXPIRED",
			"The Jupiter quote expired. Refresh the basket before signing.",
		);
	}
}
