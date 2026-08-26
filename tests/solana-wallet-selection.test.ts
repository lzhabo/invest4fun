import { describe, expect, it } from "vitest";
import {
	findEmbeddedSolanaWallet,
	findExternalSolanaWallet,
} from "../src/client/solana-wallet-selection.js";

describe("Solana wallet selection", () => {
	it("keeps an external wallet separate even when it connects first", () => {
		const wallets = [{ address: "external" }, { address: "embedded" }];
		const linkedAccounts = [
			{
				type: "wallet",
				address: "embedded",
				chainType: "solana",
				walletClientType: "privy",
			},
		];
		const embedded = findEmbeddedSolanaWallet(wallets, linkedAccounts);

		expect(embedded?.address).toBe("embedded");
		expect(findExternalSolanaWallet(wallets, embedded)?.address).toBe("external");
	});
});
