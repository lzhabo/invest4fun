import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("clean staging schema", () => {
	it("contains only Solana, Jupiter, and deterministic runtime contracts", async () => {
		const sql = await readFile(
			new URL("../migrations/001_initial.sql", import.meta.url),
			"utf8",
		);

		expect(sql).toContain("CHECK (chain = 'SOLANA')");
		expect(sql).toContain("CHECK (execution_provider = 'JUPITER')");
		expect(sql).toContain("CHECK (feed_ranking_provider = 'DETERMINISTIC')");
		expect(sql).toContain("CREATE TABLE user_preferences");
		expect(sql).toContain("CREATE TABLE executions");
		expect(sql).not.toMatch(/robinhood|zero_ex|uniswap|blink/i);
	});

	it("adds a product account keyed by Privy identity", async () => {
		const sql = await readFile(
			new URL("../migrations/002_user_accounts.sql", import.meta.url),
			"utf8",
		);

		expect(sql).toContain("CREATE TABLE user_accounts");
		expect(sql).toContain("privy_user_id text PRIMARY KEY");
		expect(sql).toContain("canonical_solana_wallet text NOT NULL");
		expect(sql).toContain("onboarding_version integer NOT NULL DEFAULT 0");
	});

	it("allows multiple baskets to share one weekly session", async () => {
		const sql = await readFile(
			new URL("../migrations/003_weekly_budget_ledger.sql", import.meta.url),
			"utf8",
		);

		expect(sql).toContain("DROP CONSTRAINT IF EXISTS executions_session_id_key");
		expect(sql).toContain("executions_session_id_idx");
	});

	it("persists per-transaction execution legs for reconciliation", async () => {
		const sql = await readFile(
			new URL("../migrations/004_execution_legs.sql", import.meta.url),
			"utf8",
		);

		expect(sql).toContain("legs jsonb NOT NULL");
		expect(sql).toContain("executions_reconciliation_idx");
	});
});
