import { describe, expect, it } from "vitest";
import { liveCheckoutUi } from "../src/client/live-checkout-ui.js";

describe("liveCheckoutUi", () => {
	it("blocks signing before Privy opens when backend broadcast is disabled", () => {
		expect(
			liveCheckoutUi({ liveExecution: true, liveBroadcastEnabled: false }),
		).toEqual({
			disabled: true,
			label: "Live purchases temporarily unavailable",
			warning: "Transaction broadcasting is currently disabled.",
		});
	});

	it("labels enabled execution as real Solana mainnet funds", () => {
		expect(
			liveCheckoutUi({ liveExecution: true, liveBroadcastEnabled: true }),
		).toEqual({
			disabled: false,
			label: "Mainnet · Real funds",
			warning: "Your wallet will sign and broadcast a real Solana transaction.",
		});
	});

	it("keeps demo execution available without broadcast", () => {
		expect(
			liveCheckoutUi({ liveExecution: false, liveBroadcastEnabled: false }),
		).toEqual({
			disabled: false,
			label: "Demo execution",
			warning: "No real funds will move.",
		});
	});
});
