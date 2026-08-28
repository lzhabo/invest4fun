import { describe, expect, it } from "vitest";
import { fundingReceiptNotifications } from "../src/client/funding-notifications.js";

describe("funding receipt notifications", () => {
	it("emits exact positive balance deltas and never emits the initial snapshot", () => {
		expect(
			fundingReceiptNotifications(undefined, {
				usdcBalanceBaseUnits: "100000",
				usdcDecimals: 6,
				solBalanceLamports: "3000000",
			}),
		).toEqual([]);

		expect(
			fundingReceiptNotifications(
				{
					usdcBalanceBaseUnits: "0",
					usdcDecimals: 6,
					solBalanceLamports: "1000000",
				},
				{
					usdcBalanceBaseUnits: "2500000",
					usdcDecimals: 6,
					solBalanceLamports: "3000000",
				},
			),
		).toEqual([
			{ asset: "USDC", amount: "2.5" },
			{ asset: "SOL", amount: "0.002" },
		]);
	});
});
