import { describe, expect, it } from "vitest";
import { MemoryStateStore } from "../src/server/store.js";
import type { ExecutionPlan } from "../src/domain/schemas.js";
import { SOLANA_NATIVE_MINT, SOLANA_USDC_MINT } from "../src/domain/solana.js";

const plan: ExecutionPlan = {
  executionId: "execution-1",
  sessionId: "filled-later",
  epochId: "2026-W30",
  provider: "JUPITER",
  chain: "SOLANA",
  cluster: "mainnet-beta",
  inputToken: SOLANA_USDC_MINT,
  signingWallet: "11111111111111111111111111111111",
  totalInputBaseUnits: "10000000",
  authorizedPlanHash: `sha256:${"a".repeat(64)}`,
  policyHash: `sha256:${"b".repeat(64)}`,
  callCommitments: [],
  quotes: [
    {
      requestId: "quote-1",
      assetId: `sol:mainnet:${SOLANA_NATIVE_MINT}`,
      tokenOut: SOLANA_NATIVE_MINT,
      amountInBaseUnits: "10000000",
      estimatedAmountOut: "1",
      minimumAmountOut: "1",
      unitPriceUsd: "10000000",
      priceImpactBps: 10,
      routing: "JUPITER",
      provider: "JUPITER",
      chain: "SOLANA",
      quotedAt: "2026-07-25T12:00:00.000Z",
      expiresAt: "2026-07-25T12:01:00.000Z"
    }
  ],
  generatedAt: "2026-07-25T12:00:00.000Z",
  solanaTransaction: {
    kind: "SOLANA_TRANSACTION",
    unsignedTransactionBase64: "dGVzdA==",
    messageCommitment: `sha256:${"c".repeat(64)}`,
    recentBlockhash: "11111111111111111111111111111111",
    lastValidBlockHeight: 1,
    expectedBalanceChanges: [{
      assetId: `sol:mainnet:${SOLANA_NATIVE_MINT}`,
      mint: SOLANA_NATIVE_MINT,
      minimumAmountOut: "1"
    }]
  }
};

describe("weekly session idempotency", () => {
	it("keeps one canonical Solana wallet for a Privy account", async () => {
		const store = new MemoryStateStore();
		const wallet = "11111111111111111111111111111111";
		const created = await store.getOrCreateAccount(
			"privy:user-1",
			wallet,
			"Europe/Lisbon",
		);

		expect(created).toMatchObject({
			privyUserId: "privy:user-1",
			canonicalSolanaWallet: wallet,
			timezone: "Europe/Lisbon",
			onboardingVersion: 0,
		});
		await expect(
			store.getOrCreateAccount(
				"privy:user-1",
				"So11111111111111111111111111111111111111112",
				"Europe/Lisbon",
			),
		).rejects.toThrow("CANONICAL_WALLET_MISMATCH");
	});

	it("marks onboarding complete only for the canonical wallet", async () => {
		const store = new MemoryStateStore();
		const wallet = "11111111111111111111111111111111";
		await store.getOrCreateAccount("privy:user-1", wallet, "Europe/Lisbon");

		const completed = await store.completeAccountOnboarding(
			"privy:user-1",
			wallet,
			1,
		);

		expect(completed).toMatchObject({
			onboardingVersion: 1,
			canonicalSolanaWallet: wallet,
		});
		expect(completed.onboardingCompletedAt).toBeTruthy();
	});

  it("returns one session per wallet and epoch", async () => {
    const store = new MemoryStateStore();
    const first = await store.openSession("0xabc", "2026-W30");
    const second = await store.openSession("0xabc", "2026-W30");
    expect(first.id).toBe(second.id);
  });

  it("uses ranking provider as part of session uniqueness", async () => {
    const store = new MemoryStateStore();
    const zeroG = await store.openSession(
      "0xabc",
      "2026-W30",
      "JUPITER",
      "SOLANA",
      "0xabc",
      "ZERO_G"
    );
    const deterministic = await store.openSession(
      "0xabc",
      "2026-W30",
      "JUPITER",
      "SOLANA",
      "0xabc",
      "DETERMINISTIC"
    );
    expect(deterministic.id).not.toBe(zeroG.id);
  });

  it("preserves case-sensitive Solana wallet addresses", async () => {
    const store = new MemoryStateStore();
    const wallet = "ENskeWSdXAfqZaDAn3xv7X8CdE88Bb3WQreWGAuk9oyh";
    const session = await store.openSession(
      wallet,
      "2026-W30",
      "JUPITER",
      "SOLANA"
    );
    expect(session.wallet).toBe(wallet);
  });

  it("returns the same execution for the same authorized intent and rejects another", async () => {
    const store = new MemoryStateStore();
    const session = await store.openSession("0xabc", "2026-W30");
    const current = { ...plan, sessionId: session.id };
    const first = await store.reserveExecution(session.id, current);
    const retry = await store.reserveExecution(session.id, {
      ...current,
      executionId: "execution-retry"
    });
    expect(retry.plan.executionId).toBe(first.plan.executionId);
    await expect(
      store.reserveExecution(session.id, {
        ...current,
        executionId: "execution-2",
        authorizedPlanHash: `sha256:${"c".repeat(64)}`
      })
    ).rejects.toThrow("EPOCH_ALREADY_EXECUTED");
  });

  it("atomically replaces an unsigned prepared plan", async () => {
    const store = new MemoryStateStore();
    const session = await store.openSession("0xabc", "2026-W30");
    const current = { ...plan, sessionId: session.id };
    await store.reserveExecution(session.id, current);

    const replacement = {
      ...current,
      authorizedPlanHash: `sha256:${"c".repeat(64)}`,
      totalInputBaseUnits: "20000000"
    };
    const refreshed = await store.refreshPreparedExecution(
      current.executionId,
      current.authorizedPlanHash,
      replacement
    );

    expect(refreshed.plan).toMatchObject({
      executionId: current.executionId,
      authorizedPlanHash: replacement.authorizedPlanHash,
      totalInputBaseUnits: "20000000"
    });
    await expect(
      store.refreshPreparedExecution(
        current.executionId,
        current.authorizedPlanHash,
        current
      )
    ).rejects.toThrow("EPOCH_ALREADY_EXECUTED");
  });

  it("persists terminal output evidence with the execution", async () => {
    const store = new MemoryStateStore();
    const session = await store.openSession("0xabc", "2026-W30");
    const current = { ...plan, sessionId: session.id };
    await store.reserveExecution(session.id, current);
    const settled = await store.updateExecution(
      current.executionId,
      "SETTLED",
      [`0x${"d".repeat(64)}`],
      [
        {
          assetId: "rh:4663:WETH",
          amountOutBaseUnits: "1",
          transactionHash: `0x${"d".repeat(64)}`,
          blockNumber: "123",
          status: "success"
        }
      ]
    );
    expect(settled.settledOutputs[0]?.blockNumber).toBe("123");
  });

  it("records a submitted atomic batch separately from sequential calls", async () => {
    const store = new MemoryStateStore();
    const session = await store.openSession("0xabc", "2026-W30");
    const current = { ...plan, sessionId: session.id };
    await store.reserveExecution(session.id, current);
    const submitted = await store.updateExecution(
      current.executionId,
      "SUBMITTED",
      [`0x${"e".repeat(64)}`],
      [],
      "BATCH"
    );
    expect(submitted.submissionMode).toBe("BATCH");
  });

  it("allows multiple settled baskets while enforcing the weekly budget", async () => {
    const store = new MemoryStateStore();
    const session = await store.openSession(
      "0xabc",
      "W:2026-W30",
      "JUPITER",
      "SOLANA",
      "privy:user-1"
    );
    const firstPlan = {
      ...plan,
      sessionId: session.id,
      totalInputBaseUnits: "30000000"
    };
    await store.reserveExecution(session.id, firstPlan, "50000000");
    await store.updateExecution(firstPlan.executionId, "SETTLED");

    const secondPlan = {
      ...plan,
      executionId: "execution-2",
      sessionId: session.id,
      authorizedPlanHash: `sha256:${"d".repeat(64)}`,
      totalInputBaseUnits: "20000000"
    };
    await expect(
      store.reserveExecution(session.id, secondPlan, "50000000")
    ).resolves.toMatchObject({ status: "PREPARED" });
    await store.updateExecution(secondPlan.executionId, "SETTLED");

    await expect(
      store.reserveExecution(
        session.id,
        {
          ...plan,
          executionId: "execution-3",
          sessionId: session.id,
          authorizedPlanHash: `sha256:${"e".repeat(64)}`,
          totalInputBaseUnits: "1"
        },
        "50000000"
      )
    ).rejects.toThrow("PERIOD_BUDGET_EXCEEDED");
  });

  it("releases a failed basket from the weekly budget", async () => {
    const store = new MemoryStateStore();
    const session = await store.openSession("0xabc", "W:2026-W30");
    const firstPlan = {
      ...plan,
      sessionId: session.id,
      totalInputBaseUnits: "50000000"
    };
    await store.reserveExecution(session.id, firstPlan, "50000000");
    await store.updateExecution(firstPlan.executionId, "FAILED");

    await expect(
      store.reserveExecution(
        session.id,
        {
          ...plan,
          executionId: "execution-after-failure",
          sessionId: session.id,
          authorizedPlanHash: `sha256:${"f".repeat(64)}`,
          totalInputBaseUnits: "50000000"
        },
        "50000000"
      )
    ).resolves.toMatchObject({ status: "PREPARED" });
  });
});
