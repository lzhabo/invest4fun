import { describe, expect, it } from "vitest";
import {
	applyDocumentTheme,
	DEFAULT_THEME_SETTINGS,
	readThemeSettings,
	type ThemeStorage,
	writeThemeSettings,
} from "../src/client/theme-settings.js";

class MemoryStorage implements ThemeStorage {
	value: string | null = null;

	getItem() {
		return this.value;
	}

	setItem(_key: string, value: string) {
		this.value = value;
	}
}

describe("theme settings", () => {
	it("defaults Solana to dark", () => {
		expect(readThemeSettings(new MemoryStorage())).toEqual(
			DEFAULT_THEME_SETTINGS,
		);
	});

	it("stores the Solana palette", () => {
		const storage = new MemoryStorage();
		writeThemeSettings({ SOLANA: "light" }, storage);

		expect(readThemeSettings(storage)).toEqual({
			SOLANA: "light",
		});
	});

	it("falls back safely when stored values are malformed", () => {
		const storage = new MemoryStorage();
		storage.value = JSON.stringify({ SOLANA: "green" });

		expect(readThemeSettings(storage)).toEqual(DEFAULT_THEME_SETTINGS);
	});

	it("applies the active theme above screens that mount and unmount", () => {
		const root = { dataset: {} as Record<string, string> };
		const themeColor = { content: "#f1f3f6" };
		applyDocumentTheme("dark", {
			documentElement: root,
			querySelector: () => themeColor,
		});

		expect(root.dataset.theme).toBe("dark");
		expect(root.dataset.chain).toBe("solana");
		expect(themeColor.content).toBe("#090B0F");
	});
});
