import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PublicConfig } from "../api";

vi.mock("@privy-io/react-auth", () => ({
	usePrivy: () => ({
		authenticated: false,
		linkWallet: vi.fn(),
		login: vi.fn(),
		user: undefined,
	}),
}));

vi.mock("@privy-io/react-auth/solana", () => ({
	useWallets: () => ({ wallets: [], ready: true }),
}));

import { Onboarding } from "./Onboarding";

describe("Onboarding", () => {
	it("keeps the signed-out hero focused on the plan instead of wallet technology", () => {
		const html = renderToStaticMarkup(
			<Onboarding
				config={{ demoMode: false } as PublicConfig}
				onComplete={vi.fn()}
				privyReady
				onChainPreview={vi.fn()}
			/>,
		);

		expect(html).toContain("Stocks and crypto. One");
		expect(html).not.toContain("Connect Solana wallet");
		expect(html).not.toContain("Activate your Investmade Wallet");
		expect(html).not.toContain(">Solana<");
	});
});
