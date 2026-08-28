import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FundingScreen } from "./FundingScreen";

const wallet = "2d6WDZNmEWEn78c55f3dSuS8YF4PTDjF4U7YUVXsT9dL";

describe("FundingScreen", () => {
	it("explains both assets required by a brand-new empty wallet", () => {
		const html = renderToStaticMarkup(
			<FundingScreen
				wallet={wallet}
				state="UNFUNDED"
				usdcBalance="0"
				solBalance="0"
				loading={false}
				onCopyAddress={() => {}}
				onConnectExternalWallet={() => {}}
				onRefresh={() => {}}
				onContinue={() => {}}
			/>,
		);

		expect(html).toContain("Fund your wallet");
		expect(html).toContain("USDC pays for your investments");
		expect(html).toContain("SOL covers network fees");
		expect(html).toContain(wallet);
		expect(html).toContain("Copy address");
		expect(html).toContain("Connect Solana wallet");
		expect(html).toContain("Browse feed without funding");
	});

	it("asks only for SOL when the wallet already has enough USDC", () => {
		const html = renderToStaticMarkup(
			<FundingScreen
				wallet={wallet}
				state="NEEDS_SOL"
				usdcBalance="0.1"
				solBalance="0"
				loading={false}
				onCopyAddress={() => {}}
				onConnectExternalWallet={() => {}}
				onRefresh={() => {}}
				onContinue={() => {}}
			/>,
		);

		expect(html).toContain("Add SOL for fees");
		expect(html).toContain("0.1 USDC");
	});

	it("offers USDC and SOL transfers after an external wallet connects", () => {
		const html = renderToStaticMarkup(
			<FundingScreen
				wallet={wallet}
				state="UNFUNDED"
				usdcBalance="0"
				solBalance="0"
				loading={false}
				fundingWalletAddress="ExternalSolanaWallet111111111111111111111"
				onCopyAddress={() => {}}
				onConnectExternalWallet={() => {}}
				onSendUsdc={() => {}}
				onSendSol={() => {}}
				onRefresh={() => {}}
				onContinue={() => {}}
			/>,
		);

		expect(html).toContain("Deposit USDC");
		expect(html).toContain("Send USDC");
		expect(html).toContain("Add SOL for network fees");
		expect(html).toContain("Send SOL");
	});

	it("keeps partial funding actionable without claiming the wallet is ready", () => {
		const html = renderToStaticMarkup(
			<FundingScreen
				wallet={wallet}
				state="NEEDS_USDC"
				usdcBalance="0.01"
				solBalance="0.003"
				loading={false}
				onCopyAddress={() => {}}
				onConnectExternalWallet={() => {}}
				onRefresh={() => {}}
				onContinue={() => {}}
			/>,
		);

		expect(html).toContain("Add USDC to invest");
		expect(html).toContain("0.10 USDC required");
		expect(html).not.toContain("Continue to feed");
		expect(html).toContain("Browse feed without funding");
		expect(html).not.toContain("Funds received");
	});
});
