import type {
	ExecutionProvider,
	SolanaPreparedTransaction,
} from "./adapters/types.js";
import { ExecutionProviderError } from "./adapters/types.js";
import type { ExecutionRecord, StateStore } from "./store.js";

export async function broadcastPreparedExecution(input: {
	execution: ExecutionRecord;
	signedTransactions: string[];
	provider: Pick<
		ExecutionProvider,
		"submitSignedTransaction" | "signedTransactionSignature"
	>;
	store: Pick<StateStore, "transitionExecutionLeg">;
	now?: () => Date;
}): Promise<{ execution: ExecutionRecord; hasUnknownBroadcast: boolean }> {
	const preparedTransactions =
		input.execution.plan.solanaTransactions ??
		(input.execution.plan.solanaTransaction
			? [input.execution.plan.solanaTransaction]
			: []);
	const submit = input.provider.submitSignedTransaction;
	const signatureFor = input.provider.signedTransactionSignature;
	if (!preparedTransactions.length || !submit || !signatureFor) {
		throw new Error("SOLANA_TRANSACTION_MISSING");
	}
	if (input.signedTransactions.length !== preparedTransactions.length) {
		throw new Error("INVALID_SOLANA_TRANSACTION_COUNT");
	}
	const now = input.now ?? (() => new Date());
	let current = input.execution;
	const claimed = [] as Array<{
		index: number;
		prepared: SolanaPreparedTransaction;
		signed: string;
	}>;
	for (const [index, prepared] of preparedTransactions.entries()) {
		const signed = input.signedTransactions[index] ?? "";
		const normalized = {
			...prepared,
			messageCommitment: prepared.messageCommitment as `sha256:${string}`,
		};
		const signature = signatureFor.call(input.provider, normalized, signed);
		current = await input.store.transitionExecutionLeg(
			input.execution.plan.executionId,
			index,
			{
				type: "CLAIM_BROADCAST",
				signature,
				signedTransactionBase64: signed,
				at: now().toISOString(),
			},
		);
		claimed.push({ index, prepared: normalized, signed });
	}
	const submissions = await Promise.allSettled(
		claimed.map(({ prepared, signed }) =>
			submit.call(input.provider, prepared, signed),
		),
	);
	let hasUnknownBroadcast = false;
	for (const [position, result] of submissions.entries()) {
		const claim = claimed[position];
		if (!claim) continue;
		if (result.status === "fulfilled") {
			current = await input.store.transitionExecutionLeg(
				input.execution.plan.executionId,
				claim.index,
				{ type: "BROADCAST_ACCEPTED", at: now().toISOString() },
			);
			continue;
		}
		hasUnknownBroadcast = true;
		current = await input.store.transitionExecutionLeg(
			input.execution.plan.executionId,
			claim.index,
			{
				type: "BROADCAST_UNKNOWN",
				at: now().toISOString(),
				failureCode:
					result.reason instanceof ExecutionProviderError
						? result.reason.code
						: "BROADCAST_ERROR",
				failureMessage: "Broadcast outcome requires reconciliation.",
			},
		);
	}
	return { execution: current, hasUnknownBroadcast };
}
