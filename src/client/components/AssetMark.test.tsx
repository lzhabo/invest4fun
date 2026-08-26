import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AssetMark } from "./AssetMark";

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
});
