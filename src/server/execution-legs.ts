import type { ExecutionPlan } from "../domain/schemas.js";

export type ExecutionLegStatus =
	| "PREPARED"
	| "BROADCASTING"
	| "SUBMITTED"
	| "CONFIRMED"
	| "FINALIZED"
	| "FAILED"
	| "UNKNOWN";

export interface ExecutionLeg {
	index: number;
	assetIds: string[];
	amountInBaseUnits: string;
	messageCommitment: string;
	lastValidBlockHeight: number;
	status: ExecutionLegStatus;
	signature?: string;
	failureCode?: string;
	failureMessage?: string;
	updatedAt: string;
}

export type ExecutionLegTransition =
	| { type: "CLAIM_BROADCAST"; signature: string; at: string }
	| { type: "BROADCAST_ACCEPTED"; at: string }
	| {
			type: "BROADCAST_UNKNOWN";
			at: string;
			failureCode?: string;
			failureMessage?: string;
	  }
	| { type: "OBSERVED_CONFIRMED"; at: string }
	| { type: "OBSERVED_FINALIZED"; at: string }
	| {
			type: "OBSERVED_FAILED";
			at: string;
			failureCode?: string;
			failureMessage?: string;
	  };

export function executionLegsFromPlan(
	plan: ExecutionPlan,
	now = new Date(),
): ExecutionLeg[] {
	const transactions =
		plan.solanaTransactions ??
		(plan.solanaTransaction ? [plan.solanaTransaction] : []);
	const quoteByAsset = new Map(plan.quotes.map((quote) => [quote.assetId, quote]));
	return transactions.map((transaction, index) => {
		const assetIds = transaction.expectedBalanceChanges.map(
			(change) => change.assetId,
		);
		const amountInBaseUnits = assetIds
			.reduce(
				(sum, assetId) =>
					sum + BigInt(quoteByAsset.get(assetId)?.amountInBaseUnits ?? "0"),
				0n,
			)
			.toString();
		return {
			index,
			assetIds,
			amountInBaseUnits,
			messageCommitment: transaction.messageCommitment,
			lastValidBlockHeight: transaction.lastValidBlockHeight,
			status: "PREPARED",
			updatedAt: now.toISOString(),
		};
	});
}

export function transitionExecutionLeg(
	leg: ExecutionLeg,
	transition: ExecutionLegTransition,
): ExecutionLeg {
	const allowed = allowedTransitions[leg.status];
	if (!allowed.has(transition.type)) {
		throw new Error(`INVALID_EXECUTION_LEG_TRANSITION:${leg.status}:${transition.type}`);
	}
	switch (transition.type) {
		case "CLAIM_BROADCAST":
			if (!transition.signature) throw new Error("SOLANA_SIGNATURE_REQUIRED");
			return {
				...leg,
				status: "BROADCASTING",
				signature: transition.signature,
				failureCode: undefined,
				failureMessage: undefined,
				updatedAt: transition.at,
			};
		case "BROADCAST_ACCEPTED":
			return { ...leg, status: "SUBMITTED", updatedAt: transition.at };
		case "BROADCAST_UNKNOWN":
			return {
				...leg,
				status: "UNKNOWN",
				failureCode: transition.failureCode,
				failureMessage: transition.failureMessage,
				updatedAt: transition.at,
			};
		case "OBSERVED_CONFIRMED":
			return { ...leg, status: "CONFIRMED", updatedAt: transition.at };
		case "OBSERVED_FINALIZED":
			return { ...leg, status: "FINALIZED", updatedAt: transition.at };
		case "OBSERVED_FAILED":
			return {
				...leg,
				status: "FAILED",
				failureCode: transition.failureCode,
				failureMessage: transition.failureMessage,
				updatedAt: transition.at,
			};
	}
}

export function executionStatusFromLegs(
	legs: ExecutionLeg[],
): "PREPARED" | "SUBMITTED" | "SETTLED" | "PARTIAL" | "FAILED" {
	if (!legs.length || legs.every((leg) => leg.status === "PREPARED")) {
		return "PREPARED";
	}
	const terminal = legs.every(
		(leg) => leg.status === "FINALIZED" || leg.status === "FAILED",
	);
	if (!terminal) return "SUBMITTED";
	if (legs.every((leg) => leg.status === "FINALIZED")) return "SETTLED";
	if (legs.every((leg) => leg.status === "FAILED")) return "FAILED";
	return "PARTIAL";
}

const allowedTransitions: Record<
	ExecutionLegStatus,
	ReadonlySet<ExecutionLegTransition["type"]>
> = {
	PREPARED: new Set(["CLAIM_BROADCAST"]),
	BROADCASTING: new Set([
		"BROADCAST_ACCEPTED",
		"BROADCAST_UNKNOWN",
		"OBSERVED_CONFIRMED",
		"OBSERVED_FINALIZED",
		"OBSERVED_FAILED",
	]),
	SUBMITTED: new Set([
		"OBSERVED_CONFIRMED",
		"OBSERVED_FINALIZED",
		"OBSERVED_FAILED",
	]),
	UNKNOWN: new Set([
		"BROADCAST_ACCEPTED",
		"OBSERVED_CONFIRMED",
		"OBSERVED_FINALIZED",
		"OBSERVED_FAILED",
	]),
	CONFIRMED: new Set(["OBSERVED_FINALIZED", "OBSERVED_FAILED"]),
	FINALIZED: new Set(),
	FAILED: new Set(),
};
