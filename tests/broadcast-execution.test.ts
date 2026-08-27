import { describe, expect, it } from "vitest";
import type { ExecutionPlan } from "../src/domain/schemas.js";
import { broadcastPreparedExecution } from "../src/server/broadcast-execution.js";
import { MemoryStateStore } from "../src/server/store.js";

const prepared = (assetId: string, byte: string) => ({
	kind: "SOLANA_TRANSACTION" as const,
	unsignedTransactionBase64: "transaction",
	messageCommitment: `sha256:${byte.repeat(64)}` as `sha256:${string}`,
	recentBlockhash: "11111111111111111111111111111111",
	lastValidBlockHeight: 500,
	expectedBalanceChanges: [
		{ assetId, mint: "So11111111111111111111111111111111111111112", minimumAmountOut: "1" },
	],
});

describe("sequential execution broadcaster", () => {
	it("persists each signature before sending and continues after an unknown outcome", async () => {
		const store = new MemoryStateStore();
		const session = await store.openSession("wallet", "epoch");
		const plan = {
			executionId: "execution",
			sessionId: session.id,
			totalInputBaseUnits: "300000",
			quotes: [
				{ assetId: "asset-a", amountInBaseUnits: "100000" },
				{ assetId: "asset-b", amountInBaseUnits: "200000" },
			],
			solanaTransactions: [prepared("asset-a", "a"), prepared("asset-b", "b")],
		} as ExecutionPlan;
		const execution = await store.reserveExecution(session.id, plan);
		const events: string[] = [];
		const result = await broadcastPreparedExecution({
			execution,
			signedTransactions: ["signed-a", "signed-b"],
			provider: {
				signedTransactionSignature: (_transaction, signed) => {
					events.push(`inspect:${signed}`);
					return `signature:${signed}`;
				},
				submitSignedTransaction: async (_transaction, signed) => {
					events.push(`send:${signed}`);
					if (signed === "signed-a") throw new Error("RPC_TIMEOUT");
					return `signature:${signed}`;
				},
			},
			store: {
				transitionExecutionLeg: async (id, index, transition) => {
					events.push(`${transition.type}:${index}`);
					return store.transitionExecutionLeg(id, index, transition);
				},
			},
			now: () => new Date("2026-08-27T12:00:00.000Z"),
		});

		expect(events).toEqual([
			"inspect:signed-a",
			"CLAIM_BROADCAST:0",
			"send:signed-a",
			"BROADCAST_UNKNOWN:0",
			"inspect:signed-b",
			"CLAIM_BROADCAST:1",
			"send:signed-b",
			"BROADCAST_ACCEPTED:1",
		]);
		expect(result.hasUnknownBroadcast).toBe(true);
		expect(result.execution.legs.map((leg) => leg.status)).toEqual([
			"UNKNOWN",
			"SUBMITTED",
		]);
	});
});
