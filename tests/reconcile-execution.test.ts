import { describe, expect, it, vi } from "vitest";
import type { ExecutionPlan } from "../src/domain/schemas.js";
import {
	executionStatusFromLegs,
	transitionExecutionLeg,
} from "../src/server/execution-legs.js";
import { reconcileExecution } from "../src/server/reconcile-execution.js";
import type {
	ExecutionRecord,
	SettledOutput,
	WeeklySession,
} from "../src/server/store.js";

const plan = {
	executionId: "execution-1",
	sessionId: "session-1",
	provider: "JUPITER",
	chain: "SOLANA",
	quotes: [
		{ assetId: "sol:mainnet:SOL", amountInBaseUnits: "100000" },
		{ assetId: "sol:mainnet:JUP", amountInBaseUnits: "100000" },
	],
	solanaTransactions: ["SOL", "JUP"].map((symbol, index) => ({
		kind: "SOLANA_TRANSACTION",
		unsignedTransactionBase64: "transaction",
		messageCommitment: `sha256:${String(index).repeat(64)}`,
		recentBlockhash: "11111111111111111111111111111111",
		lastValidBlockHeight: 500,
		expectedBalanceChanges: [
			{
				assetId: `sol:mainnet:${symbol}`,
				mint: "So11111111111111111111111111111111111111112",
				minimumAmountOut: "1",
			},
		],
	})),
} as ExecutionPlan;

const session = {
	id: "session-1",
	wallet: "11111111111111111111111111111111",
} as WeeklySession;

function submittedExecution(): ExecutionRecord {
	const executionPlan = structuredClone(plan);
	return {
		plan: executionPlan,
		status: "SUBMITTED",
		submissionMode: "SEQUENTIAL",
		transactionHashes: ["signature-0", "signature-1"],
		settledOutputs: [],
		legs:
			executionPlan.solanaTransactions?.map((transaction, index) => ({
				index,
				assetIds: transaction.expectedBalanceChanges.map(
					(item) => item.assetId,
				),
				amountInBaseUnits: "100000",
				messageCommitment: transaction.messageCommitment,
				lastValidBlockHeight: transaction.lastValidBlockHeight,
				status: "SUBMITTED",
				signature: `signature-${index}`,
				updatedAt: "2026-08-28T10:00:00.000Z",
			})) ?? [],
	};
}

function mutableStore(initial: ExecutionRecord) {
	let current = initial;
	return {
		store: {
			transitionExecutionLeg: vi.fn(async (_id, index, transition) => {
				const legs = current.legs.map((leg, legIndex) =>
					legIndex === index ? transitionExecutionLeg(leg, transition) : leg,
				);
				current = {
					...current,
					legs,
					status: executionStatusFromLegs(legs),
					transactionHashes: legs.flatMap((leg) => leg.signature ?? []),
				};
				return current;
			}),
			updateExecution: vi.fn(
				async (
					_id,
					status,
					transactionHashes,
					settledOutputs: SettledOutput[],
				) => {
					current = { ...current, status, transactionHashes, settledOutputs };
					return current;
				},
			),
		},
		current: () => current,
	};
}

describe("execution reconciliation", () => {
	it("checks independent transaction statuses in parallel", async () => {
		const execution = submittedExecution();
		const state = mutableStore(execution);
		let active = 0;
		let peakActive = 0;
		await reconcileExecution({
			execution,
			session,
			store: state.store,
			provider: {
				transactionStatus: vi.fn(async () => {
					active += 1;
					peakActive = Math.max(peakActive, active);
					await new Promise((resolve) => setTimeout(resolve, 5));
					active -= 1;
					return { state: "NOT_FOUND" as const };
				}),
				reconcileOutputs: vi.fn(),
			},
		});

		expect(peakActive).toBe(2);
	});

	it("keeps an absent signature pending until the provider proves expiry", async () => {
		const execution = submittedExecution();
		const state = mutableStore(execution);
		const result = await reconcileExecution({
			execution,
			session,
			store: state.store,
			provider: {
				transactionStatus: vi.fn(async () => ({ state: "NOT_FOUND" as const })),
				reconcileOutputs: vi.fn(),
			},
		});

		expect(result.pending).toBe(true);
		expect(result.execution.status).toBe("SUBMITTED");
		expect(state.store.transitionExecutionLeg).not.toHaveBeenCalled();
	});

	it("rebroadcasts only the persisted signed payload after an unknown outcome", async () => {
		const execution = submittedExecution();
		execution.legs = execution.legs.slice(0, 1).map((leg) => ({
			...leg,
			status: "UNKNOWN",
			signedTransactionBase64: "persisted-signed-payload",
		}));
		execution.plan.solanaTransactions =
			execution.plan.solanaTransactions?.slice(0, 1);
		const state = mutableStore(execution);
		const submitSignedTransaction = vi.fn(async () => "signature-0");
		const result = await reconcileExecution({
			execution,
			session,
			store: state.store,
			provider: {
				transactionStatus: vi.fn(async () => ({ state: "NOT_FOUND" as const })),
				reconcileOutputs: vi.fn(),
				submitSignedTransaction,
			},
		});

		expect(result.pending).toBe(true);
		expect(submitSignedTransaction).toHaveBeenCalledWith(
			expect.any(Object),
			"persisted-signed-payload",
		);
		expect(result.execution.legs[0]?.status).toBe("SUBMITTED");
	});

	it("settles finalized legs and records only definitively failed legs as retryable", async () => {
		const execution = submittedExecution();
		const state = mutableStore(execution);
		const result = await reconcileExecution({
			execution,
			session,
			store: state.store,
			provider: {
				transactionStatus: vi
					.fn()
					.mockResolvedValueOnce({ state: "FINALIZED", slot: 10 })
					.mockResolvedValueOnce({ state: "FAILED", slot: 11 }),
				reconcileOutputs: vi.fn(async (signature, _wallet, expected) =>
					expected.map((change: { assetId: string }) => ({
						assetId: change.assetId,
						amountOutBaseUnits: "25",
						transactionHash: signature,
						status: "success" as const,
					})),
				),
			},
		});

		expect(result.pending).toBe(false);
		expect(result.execution.status).toBe("PARTIAL");
		expect(result.execution.legs.map((leg) => leg.status)).toEqual([
			"FINALIZED",
			"FAILED",
		]);
		expect(result.execution.settledOutputs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					assetId: "sol:mainnet:SOL",
					status: "success",
				}),
				expect.objectContaining({
					assetId: "sol:mainnet:JUP",
					status: "failed",
				}),
			]),
		);
	});

	it("keeps a finalized transaction processing when output verification is delayed", async () => {
		const execution = submittedExecution();
		execution.plan.solanaTransactions =
			execution.plan.solanaTransactions?.slice(0, 1);
		execution.legs = execution.legs.slice(0, 1);
		execution.transactionHashes = execution.transactionHashes.slice(0, 1);
		const state = mutableStore(execution);
		const result = await reconcileExecution({
			execution,
			session,
			store: state.store,
			provider: {
				transactionStatus: vi.fn(async () => ({
					state: "FINALIZED" as const,
					slot: 12,
				})),
				reconcileOutputs: vi.fn(async (signature, _wallet, expected) =>
					expected.map((change: { assetId: string }) => ({
						assetId: change.assetId,
						amountOutBaseUnits: "0",
						transactionHash: signature,
						status: "failed" as const,
					})),
				),
			},
		});

		expect(result.pending).toBe(true);
		expect(result.execution.status).toBe("SUBMITTED");
		expect(result.execution.legs[0]?.status).toBe("OUTPUT_UNVERIFIED");
		expect(result.execution.settledOutputs[0]?.status).toBe("unverified");
	});

	it("repairs a legacy partial receipt that failed only output validation", async () => {
		const execution = submittedExecution();
		execution.status = "PARTIAL";
		execution.legs = execution.legs.map((leg, index) =>
			index === 0
				? { ...leg, status: "FINALIZED" }
				: {
						...leg,
						status: "FAILED",
						failureCode: "OUTPUT_VALIDATION_FAILED",
					},
		);
		const state = mutableStore(execution);
		const result = await reconcileExecution({
			execution,
			session,
			store: state.store,
			provider: {
				transactionStatus: vi.fn(async () => ({
					state: "FINALIZED" as const,
					slot: 13,
				})),
				reconcileOutputs: vi.fn(async (signature, _wallet, expected) =>
					expected.map((change: { assetId: string }) => ({
						assetId: change.assetId,
						amountOutBaseUnits: "25",
						transactionHash: signature,
						status: "success" as const,
					})),
				),
			},
		});

		expect(result.pending).toBe(false);
		expect(result.execution.legs.map((leg) => leg.status)).toEqual([
			"FINALIZED",
			"FINALIZED",
		]);
		expect(result.execution.status).toBe("SETTLED");
	});
});
