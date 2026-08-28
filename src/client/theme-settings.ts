export type AppTheme = "light" | "dark";
export type ThemeSettings = { SOLANA: AppTheme };

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
	SOLANA: "dark",
};

const THEME_SETTINGS_KEY = "invest4:theme-settings:v1";

export interface ThemeStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

interface ThemeDocument {
	documentElement: { dataset: Record<string, string | undefined> };
	querySelector(selector: string): { content: string } | null;
}

function browserStorage(): ThemeStorage | undefined {
	return (globalThis as { localStorage?: ThemeStorage }).localStorage;
}

export function readThemeSettings(storage = browserStorage()): ThemeSettings {
	if (!storage) return DEFAULT_THEME_SETTINGS;
	try {
		const value = JSON.parse(
			storage.getItem(THEME_SETTINGS_KEY) ?? "null",
		) as Partial<ThemeSettings> | null;
		return {
			SOLANA: value?.SOLANA === "light" ? "light" : "dark",
		};
	} catch {
		return DEFAULT_THEME_SETTINGS;
	}
}

export function writeThemeSettings(
	settings: ThemeSettings,
	storage = browserStorage(),
) {
	storage?.setItem(THEME_SETTINGS_KEY, JSON.stringify(settings));
}

export function applyDocumentTheme(
	theme: AppTheme,
	documentTarget = (globalThis as { document?: ThemeDocument }).document,
) {
	if (!documentTarget) return;
	documentTarget.documentElement.dataset.chain = "solana";
	documentTarget.documentElement.dataset.theme = theme;
	const themeColor = documentTarget.querySelector('meta[name="theme-color"]');
	if (themeColor) {
		themeColor.content = theme === "dark" ? "#090B0F" : "#f1f3f6";
	}
}
