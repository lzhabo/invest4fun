import type { OnboardingPreferences } from "../domain/schemas.js";
import { ApiError } from "./api.js";

export type AccountBootstrapResult =
	| { state: "new" }
	| { state: "returning"; preferences: OnboardingPreferences }
	| { state: "reauthenticate"; error: unknown }
	| {
			state: "unavailable";
			cachedPreferences?: OnboardingPreferences;
			error: unknown;
	  };

export async function resolveAccountBootstrap(deps: {
	ensureAccount: () => Promise<unknown>;
	loadPreferences: () => Promise<OnboardingPreferences>;
	readCachedPreferences: () => OnboardingPreferences | undefined;
}): Promise<AccountBootstrapResult> {
	try {
		await deps.ensureAccount();
		return {
			state: "returning",
			preferences: await deps.loadPreferences(),
		};
	} catch (error) {
		if (error instanceof ApiError && error.code === "PREFERENCES_NOT_FOUND") {
			return { state: "new" };
		}
		if (
			error instanceof ApiError &&
			["AUTH_REQUIRED", "AUTH_INVALID", "AUTH_EXPIRED"].includes(error.code)
		) {
			return { state: "reauthenticate", error };
		}
		return {
			state: "unavailable",
			cachedPreferences: deps.readCachedPreferences(),
			error,
		};
	}
}
