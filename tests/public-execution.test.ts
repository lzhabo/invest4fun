import { describe, expect, it } from "vitest";
import { publicExecution } from "../src/server/public-execution.js";
import type { ExecutionRecord } from "../src/server/store.js";

describe("public execution responses", () => {
	it("never exposes a persisted signed transaction payload", () => {
		const execution = {
			plan: {},
			status: "SUBMITTED",
			submissionMode: "BATCH",
			transactionHashes: ["signature"],
			settledOutputs: [],
			legs: [
				{
					index: 0,
					assetIds: ["sol:mainnet:SOL"],
					amountInBaseUnits: "100000",
					messageCommitment: `sha256:${"0".repeat(64)}`,
					lastValidBlockHeight: 1,
					status: "SUBMITTED",
					signature: "signature",
					signedTransactionBase64: "replayable-payload",
					updatedAt: "2026-08-28T12:00:00.000Z",
				},
			],
		} as unknown as ExecutionRecord;

		const serialized = JSON.stringify(publicExecution(execution));
		expect(serialized).not.toContain("replayable-payload");
		expect(serialized).not.toContain("signedTransactionBase64");
		expect(serialized).toContain("signature");
	});
});
