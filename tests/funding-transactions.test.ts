import {
	Keypair,
	SystemInstruction,
	Transaction,
} from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { SOLANA_USDC_MINT } from "../src/domain/solana.js";
import {
	buildSolFundingTransaction,
	buildUsdcFundingTransaction,
} from "../src/client/funding-transactions.js";

const blockhash = "11111111111111111111111111111111";

describe("funding transactions", () => {
	it("builds a user-signed SOL transfer to the embedded wallet", () => {
		const from = Keypair.generate().publicKey.toBase58();
		const to = Keypair.generate().publicKey.toBase58();
		const transaction = Transaction.from(
			buildSolFundingTransaction({ from, to, solAmount: 0.01, blockhash }),
		);
		const instruction = transaction.instructions[0];
		if (!instruction) throw new Error("TRANSFER_INSTRUCTION_REQUIRED");
		const decoded = SystemInstruction.decodeTransfer(instruction);

		expect(decoded.fromPubkey.toBase58()).toBe(from);
		expect(decoded.toPubkey.toBase58()).toBe(to);
		expect(decoded.lamports).toBe(10_000_000n);
	});

	it("creates the destination USDC account idempotently before transferring", () => {
		const from = Keypair.generate().publicKey.toBase58();
		const to = Keypair.generate().publicKey.toBase58();
		const transaction = Transaction.from(
			buildUsdcFundingTransaction({
				from,
				to,
				usdcAmount: 12.5,
				blockhash,
				mint: SOLANA_USDC_MINT,
			}),
		);

		expect(transaction.instructions).toHaveLength(2);
		expect(transaction.instructions[0]?.data[0]).toBe(1);
		expect(transaction.instructions[1]?.data[0]).toBe(12);
		expect(transaction.instructions[1]?.data.readBigUInt64LE(1)).toBe(
			12_500_000n,
		);
	});
});
