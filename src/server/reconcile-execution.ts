import type { ExecutionProvider } from "./adapters/types.js";
import type { ExecutionRecord, StateStore, WeeklySession } from "./store.js";

export interface ReconciliationResult {
	execution: ExecutionRecord;
	pending: boolean;
}

export async function reconcileExecution(input: {
	execution: ExecutionRecord;
	session: WeeklySession;
	provider: Pick<
		ExecutionProvider,
		"transactionStatus" | "reconcileOutputs" | "submitSignedTransaction"
	>;
	store: Pick<StateStore, "transitionExecutionLeg" | "updateExecution">;
	now?: () => Date;
}): Promise<ReconciliationResult> {
	const preparedTransactions =
		input.execution.plan.solanaTransactions ??
		(input.execution.plan.solanaTransaction
			? [input.execution.plan.solanaTransaction]
			: []);
	if (
		!preparedTransactions.length ||
		!input.provider.transactionStatus ||
		!input.provider.reconcileOutputs
	) {
		throw new Error("SOLANA_RECONCILIATION_UNAVAILABLE");
	}

	let current = input.execution;
	let pending = false;
	const outputsByAsset = new Map(
		input.execution.settledOutputs.map((output) => [output.assetId, output]),
	);
	const observations = await Promise.all(
		preparedTransactions.map(async (prepared, index) => {
			const leg = input.execution.legs[index];
			const signature = leg?.signature;
			if (
				!leg ||
				!signature ||
				leg.status === "PREPARED" ||
				leg.status === "FINALIZED" ||
				(leg.status === "FAILED" &&
					leg.failureCode !== "OUTPUT_VALIDATION_FAILED")
			) {
				return { prepared, index, leg, signature };
			}
			const observed = await input.provider.transactionStatus?.(
				signature,
				leg.lastValidBlockHeight,
			);
			const reconciled =
				observed?.state === "CONFIRMED" || observed?.state === "FINALIZED"
					? await input.provider.reconcileOutputs?.(
							signature,
							input.session.wallet,
							prepared.expectedBalanceChanges,
						)
					: undefined;
			return { prepared, index, leg, signature, observed, reconciled };
		}),
	);

	for (const observation of observations) {
		const { index, prepared, signature, observed, reconciled } = observation;
		let leg = current.legs[index];
		if (!leg || !signature || leg.status === "PREPARED") {
			pending = true;
			continue;
		}
		if (leg.status === "FINALIZED") continue;
		if (leg.status === "FAILED") {
			if (leg.failureCode !== "OUTPUT_VALIDATION_FAILED") continue;
			current = await input.store.transitionExecutionLeg(
				input.execution.plan.executionId,
				index,
				{
					type: "REOPEN_VERIFICATION",
					at: (input.now?.() ?? new Date()).toISOString(),
				},
			);
			leg = current.legs[index];
			if (!leg) continue;
		}

		if (!observed) continue;
		if (observed.state === "NOT_FOUND" || observed.state === "PENDING") {
			if (
				observed.state === "NOT_FOUND" &&
				leg.status === "UNKNOWN" &&
				leg.signedTransactionBase64 &&
				input.provider.submitSignedTransaction
			) {
				try {
					await input.provider.submitSignedTransaction(
						{
							...prepared,
							messageCommitment:
								prepared.messageCommitment as `sha256:${string}`,
						},
						leg.signedTransactionBase64,
					);
					current = await input.store.transitionExecutionLeg(
						input.execution.plan.executionId,
						index,
						{
							type: "BROADCAST_ACCEPTED",
							at: (input.now?.() ?? new Date()).toISOString(),
						},
					);
				} catch {
					// Keep UNKNOWN: the exact signed payload can be reconciled or retried later.
				}
			}
			pending = true;
			continue;
		}
		if (observed.state === "FAILED") {
			current = await input.store.transitionExecutionLeg(
				input.execution.plan.executionId,
				index,
				{
					type: "OBSERVED_FAILED",
					at: (input.now?.() ?? new Date()).toISOString(),
					failureCode: "SOLANA_TRANSACTION_FAILED",
				},
			);
			for (const change of prepared.expectedBalanceChanges) {
				outputsByAsset.set(change.assetId, {
					assetId: change.assetId,
					amountOutBaseUnits: "0",
					transactionHash: signature,
					blockNumber: observed.slot?.toString(),
					status: "failed",
				});
			}
			continue;
		}

		if (!reconciled) {
			if (observed.state === "FINALIZED") {
				for (const change of prepared.expectedBalanceChanges) {
					outputsByAsset.set(change.assetId, {
						assetId: change.assetId,
						amountOutBaseUnits: "0",
						transactionHash: signature,
						blockNumber: observed.slot?.toString(),
						status: "unverified",
					});
				}
				current = await input.store.transitionExecutionLeg(
					input.execution.plan.executionId,
					index,
					{
						type: "OBSERVED_UNVERIFIED",
						at: (input.now?.() ?? new Date()).toISOString(),
					},
				);
			}
			pending = true;
			continue;
		}
		for (const output of reconciled) {
			outputsByAsset.set(output.assetId, {
				...output,
				status: output.status === "success" ? "success" : "unverified",
			});
		}

		if (observed.state === "CONFIRMED") {
			if (leg.status !== "CONFIRMED") {
				current = await input.store.transitionExecutionLeg(
					input.execution.plan.executionId,
					index,
					{
						type: "OBSERVED_CONFIRMED",
						at: (input.now?.() ?? new Date()).toISOString(),
					},
				);
			}
			pending = true;
			continue;
		}

		const successful = reconciled.every(
			(output) => output.status === "success",
		);
		current = await input.store.transitionExecutionLeg(
			input.execution.plan.executionId,
			index,
			{
				type: successful ? "OBSERVED_FINALIZED" : "OBSERVED_UNVERIFIED",
				at: (input.now?.() ?? new Date()).toISOString(),
			},
		);
		if (!successful) pending = true;
	}

	const execution = await input.store.updateExecution(
		input.execution.plan.executionId,
		current.status,
		current.transactionHashes,
		[...outputsByAsset.values()],
		input.execution.plan.solanaTransactions ? "SEQUENTIAL" : "BATCH",
	);
	return { execution, pending };
}
