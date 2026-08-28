import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AssetMark, assetLogoSources } from "./AssetMark";

describe("AssetMark accessibility", () => {
	it("names standalone asset marks", () => {
		const html = renderToStaticMarkup(
			<AssetMark symbol="SOL" iconUrl="https://example.com/sol.png" />,
		);

		expect(html).toContain('alt="SOL logo"');
		expect(html).not.toContain('aria-hidden="true"');
	});

	it("hides marks that duplicate adjacent asset text", () => {
		const html = renderToStaticMarkup(
			<AssetMark
				symbol="SOL"
				iconUrl="https://example.com/sol.png"
				decorative
			/>,
		);

		expect(html).toContain('aria-hidden="true"');
		expect(html).toContain('alt=""');
		expect(html).not.toContain("SOL logo");
	});

	it("resolves curated icons by asset identity instead of ticker text", () => {
		expect(
			assetLogoSources({
				assetId: "sol:mainnet:SOL",
				symbol: "NOT-SOL",
			}),
		).toEqual(["/assets/chains/solana.svg"]);
	});

	it("uses a local mint-bound cbBTC icon before remote metadata", () => {
		expect(
			assetLogoSources({
				assetId: "sol:mainnet:cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij",
				symbol: "cbBTC",
				iconUrl: "https://ipfs.io/ipfs/example",
			}),
		).toEqual([
			"/assets/tokens/cbbtc.svg",
			"https://ipfs.io/ipfs/example",
			"https://cloudflare-ipfs.com/ipfs/example",
			"https://gateway.pinata.cloud/ipfs/example",
		]);
	});

	it("uses a deterministic monogram when an unknown asset has no image", () => {
		const html = renderToStaticMarkup(
			<AssetMark assetId="sol:mainnet:unknown-mint" symbol="???" />,
		);

		expect(html).toContain('data-asset-fallback="sol:mainnet:unknown-mint"');
		expect(html).not.toContain("img.logo.dev");
	});
});
