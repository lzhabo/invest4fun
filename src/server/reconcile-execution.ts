import type { ExecutionProvider } from "./adapters/types.js";
import type { ExecutionRecord, StateStore, WeeklySession } from "./store.js";

export interface ReconciliationResult {
	execution: ExecutionRecord;
	pending: boolean;
}

export async function reconcileExecution(input: {
	execution: ExecutionRecord;
	session: WeeklySession;
	provider: Pick<ExecutionProvider, "transactionStatus" | "reconcileOutputs">;
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

	for (const [index, prepared] of preparedTransactions.entries()) {
		const leg = current.legs[index];
		const signature = leg?.signature;
		if (!leg || !signature || leg.status === "PREPARED") {
			pending = true;
			continue;
		}
		if (leg.status === "FINALIZED" || leg.status === "FAILED") continue;

		const observed = await input.provider.transactionStatus(
			signature,
			leg.lastValidBlockHeight,
		);
		if (observed.state === "NOT_FOUND" || observed.state === "PENDING") {
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

		const reconciled = await input.provider.reconcileOutputs(
			signature,
			input.session.wallet,
			prepared.expectedBalanceChanges,
		);
		if (!reconciled) {
			pending = true;
			continue;
		}
		for (const output of reconciled) outputsByAsset.set(output.assetId, output);

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

		const successful = reconciled.every((output) => output.status === "success");
		current = await input.store.transitionExecutionLeg(
			input.execution.plan.executionId,
			index,
			{
				type: successful ? "OBSERVED_FINALIZED" : "OBSERVED_FAILED",
				at: (input.now?.() ?? new Date()).toISOString(),
				...(successful ? {} : { failureCode: "OUTPUT_VALIDATION_FAILED" }),
			},
		);
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
