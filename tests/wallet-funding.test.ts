import { describe, expect, it } from "vitest";
import {
	classifyWalletFunding,
	hasReceivedFunds,
	shouldOfferTopUp,
	shouldShowFunding,
} from "../src/client/wallet-funding.js";

describe("classifyWalletFunding", () => {
	it.each([
		{
			name: "an empty wallet",
			usdcBalanceBaseUnits: "0",
			solBalanceLamports: "0",
			expected: "UNFUNDED",
		},
		{
			name: "a wallet that only has fee SOL",
			usdcBalanceBaseUnits: "0",
			solBalanceLamports: "3000000",
			expected: "NEEDS_USDC",
		},
		{
			name: "a wallet that only has enough USDC for one card",
			usdcBalanceBaseUnits: "100000",
			solBalanceLamports: "0",
			expected: "NEEDS_SOL",
		},
		{
			name: "a wallet funded for one card and first-use rent",
			usdcBalanceBaseUnits: "100000",
			solBalanceLamports: "3000000",
			expected: "READY",
		},
	])("classifies $name", ({ expected, ...balance }) => {
		expect(
			classifyWalletFunding({
				...balance,
				usdcDecimals: 6,
				ticketSizeUsd: 0.1,
			}),
		).toBe(expected);
	});
});

describe("shouldShowFunding", () => {
	it("does not treat a partial deposit as a funded wallet", () => {
		expect(shouldShowFunding("UNFUNDED")).toBe(true);
		expect(shouldShowFunding("NEEDS_USDC")).toBe(true);
		expect(shouldShowFunding("NEEDS_SOL")).toBe(true);
		expect(shouldShowFunding("READY")).toBe(false);
	});
});

describe("shouldOfferTopUp", () => {
	it("only offers funding for an insufficient-funds execution error", () => {
		expect(shouldOfferTopUp("INSUFFICIENT_FUNDS")).toBe(true);
		expect(shouldOfferTopUp("EXECUTION_ASSETS_UNAVAILABLE")).toBe(false);
		expect(shouldOfferTopUp("")).toBe(false);
	});
});

describe("hasReceivedFunds", () => {
	it("accepts any positive USDC or SOL balance", () => {
		expect(
			hasReceivedFunds({
				usdcBalanceBaseUnits: "10000",
				usdcDecimals: 6,
				solBalanceLamports: "0",
			}),
		).toBe(true);
		expect(
			hasReceivedFunds({
				usdcBalanceBaseUnits: "0",
				usdcDecimals: 6,
				solBalanceLamports: "1",
			}),
		).toBe(true);
		expect(
			hasReceivedFunds({
				usdcBalanceBaseUnits: "0",
				usdcDecimals: 6,
				solBalanceLamports: "0",
			}),
		).toBe(false);
	});
});
