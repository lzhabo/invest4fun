import type { LinkedAccount } from "@privy-io/node";
import { describe, expect, it } from "vitest";
import {
	executionActorFromLinkedAccounts,
	isSolanaWallet,
} from "../src/server/auth.js";

describe("Privy Solana wallet boundary", () => {
	it("authorizes only a Solana wallet linked to the same Privy user", () => {
		const wallet = "7dHbWXadHki3tFQ5wPzQ3pQZf2fQxv9KZQmXWm8pY7e";
		const accounts = [
			{ type: "wallet", chain_type: "solana", address: wallet },
		] as LinkedAccount[];

		expect(executionActorFromLinkedAccounts(accounts, wallet)).toEqual({
			wallet,
			txOrigin: wallet,
			chain: "SOLANA",
		});
		expect(() =>
			executionActorFromLinkedAccounts(
				accounts,
				"8dHbWXadHki3tFQ5wPzQ3pQZf2fQxv9KZQmXWm8pY7e",
			),
		).toThrow("SOLANA_WALLET_NOT_LINKED_TO_PRIVY_USER");
	});

	it("does not treat Ethereum accounts as Solana wallets", () => {
		expect(
			isSolanaWallet({
				type: "wallet",
				chain_type: "ethereum",
				address: "0x71f30000000000000000000000000000000009a2",
			} as LinkedAccount),
		).toBe(false);
	});
});
