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
});
