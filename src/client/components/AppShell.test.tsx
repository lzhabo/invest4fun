import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppShell, PrimaryNav } from "./AppShell";

describe("PrimaryNav", () => {
	it("marks only the rendered Portfolio view as current", () => {
		const html = renderToStaticMarkup(<PrimaryNav active="positions" />);
		const labels = [...html.matchAll(/<span>([^<]+)<\/span>/g)].map(
			(match) => match[1],
		);
		const currentLinks = (html.match(/<a[\s\S]*?<\/a>/g) ?? []).filter((link) =>
			link.includes('aria-current="page"'),
		);

		expect(currentLinks).toHaveLength(1);
		expect(currentLinks[0]).toContain('class="nav-link active"');
		expect(currentLinks[0]).toContain('href="/portfolio"');
		expect(currentLinks[0]).toContain("<span>Portfolio</span>");
		expect(currentLinks[0]).not.toContain("<span>Account</span>");
		expect(html).toContain('href="/feed"');
		expect(html).toContain('href="/builder"');
		expect(html).toContain('href="/ideas"');
		expect(html).toContain('href="/settings"');
		expect(html).toContain("--primary-nav-count:5");
		expect(labels).toEqual([
			"Feed",
			"Ideas",
			"Builder",
			"Portfolio",
			"Settings",
		]);
	});
});

describe("signed-out AppShell", () => {
	const props = {
		active: "week" as const,
		onNavigate: () => {},
		onWallet: () => {},
		navigationEnabled: false,
		solanaWallets: [],
		onSolanaWalletChange: () => {},
	};

	it("shows loading until Privy is ready", () => {
		const html = renderToStaticMarkup(
			<AppShell {...props} walletReady={false}>
				<div />
			</AppShell>,
		);

		expect(html).toContain("Loading…");
		expect(html).toContain("disabled");
	});

	it("uses the neutral Sign in label when ready", () => {
		const html = renderToStaticMarkup(
			<AppShell {...props} walletReady>
				<div />
			</AppShell>,
		);

		expect(html).toContain(">Sign in</button>");
		expect(html).not.toContain("Connect wallet");
	});

	it("uses Sign in when primary navigation is enabled", () => {
		const html = renderToStaticMarkup(
			<AppShell {...props} navigationEnabled walletReady>
				<div />
			</AppShell>,
		);

		expect(html).toContain(">Sign in</button>");
		expect(html).not.toContain("Connect wallet");
	});
});
