import { describe, expect, it } from "vitest";
import { executionRequestSchema } from "../src/domain/schemas.js";
import { SOLANA_CLUSTER, SOLANA_USDC_MINT } from "../src/domain/solana.js";

describe("execution request basket size", () => {
  it("rejects baskets with more than ten assets", () => {
    const result = executionRequestSchema.safeParse({
      sessionId: "session-1",
      chain: "SOLANA",
      cluster: SOLANA_CLUSTER,
      inputToken: SOLANA_USDC_MINT,
      periodLimitUsd: 50,
      slippageBps: 50,
      selections: Array.from({ length: 11 }, (_, index) => ({
        assetId: `asset-${index}`,
        amountInBaseUnits: "1000000"
      }))
    });

    expect(result.success).toBe(false);
  });
});
