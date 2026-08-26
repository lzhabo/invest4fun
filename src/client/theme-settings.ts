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
