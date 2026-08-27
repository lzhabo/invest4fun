import { describe, expect, it } from "vitest";
import {
	executionLegsFromPlan,
	executionStatusFromLegs,
	transitionExecutionLeg,
} from "../src/server/execution-legs.js";
import type { ExecutionPlan } from "../src/domain/schemas.js";

const transaction = (assetId: string, commitment: string) => ({
	kind: "SOLANA_TRANSACTION" as const,
	unsignedTransactionBase64: "transaction",
	messageCommitment: `sha256:${commitment.repeat(64)}` as `sha256:${string}`,
	recentBlockhash: "11111111111111111111111111111111",
	lastValidBlockHeight: 500,
	expectedBalanceChanges: [
		{ assetId, mint: "So11111111111111111111111111111111111111112", minimumAmountOut: "1" },
	],
});

const plan = {
	quotes: [
		{ assetId: "sol:mainnet:SOL", amountInBaseUnits: "100000" },
		{ assetId: "sol:mainnet:JUP", amountInBaseUnits: "200000" },
	],
	solanaTransactions: [
		transaction("sol:mainnet:SOL", "a"),
		transaction("sol:mainnet:JUP", "b"),
	],
} as ExecutionPlan;

describe("execution leg state machine", () => {
	it("creates one independently tracked leg per prepared transaction", () => {
		expect(
			executionLegsFromPlan(plan, new Date("2026-08-27T12:00:00.000Z")),
		).toEqual([
			expect.objectContaining({ index: 0, assetIds: ["sol:mainnet:SOL"], amountInBaseUnits: "100000", status: "PREPARED" }),
			expect.objectContaining({ index: 1, assetIds: ["sol:mainnet:JUP"], amountInBaseUnits: "200000", status: "PREPARED" }),
		]);
	});

	it("stores the deterministic signature before broadcast can become unknown", () => {
		const [prepared] = executionLegsFromPlan(plan);
		if (!prepared) throw new Error("LEG_REQUIRED");
		const broadcasting = transitionExecutionLeg(prepared, {
			type: "CLAIM_BROADCAST",
			signature: "known-signature",
			at: "2026-08-27T12:00:00.000Z",
		});
		const unknown = transitionExecutionLeg(broadcasting, {
			type: "BROADCAST_UNKNOWN",
			at: "2026-08-27T12:00:01.000Z",
		});
		expect(unknown).toMatchObject({
			status: "UNKNOWN",
			signature: "known-signature",
		});
	});

	it("allows an unknown broadcast to be reconciled but never directly retried", () => {
		const [prepared] = executionLegsFromPlan(plan);
		if (!prepared) throw new Error("LEG_REQUIRED");
		const unknown = transitionExecutionLeg(
			transitionExecutionLeg(prepared, {
				type: "CLAIM_BROADCAST",
				signature: "known-signature",
				at: "2026-08-27T12:00:00.000Z",
			}),
			{ type: "BROADCAST_UNKNOWN", at: "2026-08-27T12:00:01.000Z" },
		);
		expect(
			transitionExecutionLeg(unknown, {
				type: "OBSERVED_FINALIZED",
				at: "2026-08-27T12:00:02.000Z",
			}),
		).toMatchObject({ status: "FINALIZED" });
		expect(() =>
			transitionExecutionLeg(unknown, {
				type: "CLAIM_BROADCAST",
				signature: "duplicate",
				at: "2026-08-27T12:00:02.000Z",
			}),
		).toThrow("INVALID_EXECUTION_LEG_TRANSITION");
	});

	it("makes finalized and failed legs terminal", () => {
		const [prepared] = executionLegsFromPlan(plan);
		if (!prepared) throw new Error("LEG_REQUIRED");
		const submitted = transitionExecutionLeg(
			transitionExecutionLeg(prepared, {
				type: "CLAIM_BROADCAST",
				signature: "known-signature",
				at: "2026-08-27T12:00:00.000Z",
			}),
			{ type: "BROADCAST_ACCEPTED", at: "2026-08-27T12:00:01.000Z" },
		);
		const finalized = transitionExecutionLeg(submitted, {
			type: "OBSERVED_FINALIZED",
			at: "2026-08-27T12:00:02.000Z",
		});
		expect(() =>
			transitionExecutionLeg(finalized, {
				type: "OBSERVED_FAILED",
				at: "2026-08-27T12:00:03.000Z",
			}),
		).toThrow("INVALID_EXECUTION_LEG_TRANSITION");
	});

	it("derives partial only after every leg has a definitive terminal result", () => {
		const legs = executionLegsFromPlan(plan);
		const submitted = legs.map((leg) =>
			transitionExecutionLeg(
				transitionExecutionLeg(leg, {
					type: "CLAIM_BROADCAST",
					signature: `signature-${leg.index}`,
					at: "2026-08-27T12:00:00.000Z",
				}),
				{ type: "BROADCAST_ACCEPTED", at: "2026-08-27T12:00:01.000Z" },
			),
		);
		const oneFailed = submitted.map((leg, index) =>
			index === 0
				? transitionExecutionLeg(leg, {
						type: "OBSERVED_FAILED",
						at: "2026-08-27T12:00:02.000Z",
					})
				: leg,
		);
		expect(executionStatusFromLegs(oneFailed)).toBe("SUBMITTED");
		expect(
			executionStatusFromLegs(
				oneFailed.map((leg, index) =>
					index === 1
						? transitionExecutionLeg(leg, {
								type: "OBSERVED_FINALIZED",
								at: "2026-08-27T12:00:03.000Z",
							})
						: leg,
				),
			),
		).toBe("PARTIAL");
	});
});
