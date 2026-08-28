import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FundingPanel } from "./FundingPanel";

describe("FundingPanel", () => {
	it("renders the polished direct-transfer and external-wallet paths", () => {
		const html = renderToStaticMarkup(
			<FundingPanel
				wallet="2d6WDZNmEWEn78c55f3dSuS8YF4PTDjF4U7YUVXsT9dL"
				qrCode="data:image/png;base64,qr"
				usdcBalance="0"
				solBalance="0"
				loading={false}
				onCopyAddress={() => {}}
				onConnectExternalWallet={() => {}}
				onRefresh={() => {}}
			/>,
		);

		expect(html).toContain("Direct transfer");
		expect(html).toContain("Copy address");
		expect(html).toContain("account-top-up-copy");
		expect(html).toContain("Transfer from external wallet");
		expect(html).toContain("Connect Solana wallet");
		expect(html).toContain("Only send USDC and SOL on the Solana network");
	});

	it("offers both asset transfers from a connected wallet", () => {
		const html = renderToStaticMarkup(
			<FundingPanel
				wallet="2d6WDZNmEWEn78c55f3dSuS8YF4PTDjF4U7YUVXsT9dL"
				usdcBalance="0.01"
				solBalance="0"
				loading={false}
				fundingWalletAddress="ExternalSolanaWallet111111111111111111111"
				onCopyAddress={() => {}}
				onConnectExternalWallet={() => {}}
				onSendUsdc={() => {}}
				onSendSol={() => {}}
				onRefresh={() => {}}
			/>,
		);

		expect(html).toContain("Send USDC");
		expect(html).toContain("Send SOL");
		expect(html).toContain("0.01 USDC");
	});
});
