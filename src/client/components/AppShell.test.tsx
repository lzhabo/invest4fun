import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrimaryNav } from "./AppShell";

describe("PrimaryNav", () => {
	it("marks only the rendered Portfolio view as current", () => {
		const html = renderToStaticMarkup(<PrimaryNav active="positions" />);
		const currentLinks = (html.match(/<a[\s\S]*?<\/a>/g) ?? []).filter(
			(link) => link.includes('aria-current="page"'),
		);

		expect(currentLinks).toHaveLength(1);
		expect(currentLinks[0]).toContain('class="nav-link active"');
		expect(currentLinks[0]).toContain('href="/portfolio"');
		expect(currentLinks[0]).toContain("<span>Portfolio</span>");
		expect(currentLinks[0]).not.toContain("<span>Account</span>");
		expect(html).toContain('href="/feed"');
		expect(html).not.toContain('href="/ideas"');
		expect(html).toContain('href="/account"');
	});
});
