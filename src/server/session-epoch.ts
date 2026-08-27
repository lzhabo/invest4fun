import type { InvestmentCadence } from "../domain/epoch.js";
import { cadenceEpoch } from "../domain/epoch.js";

export function sessionEpochId(
	cadence: InvestmentCadence,
	_mode: { demoMode: boolean; localLiveExecution: boolean },
	_nonce?: string,
	timezone = "UTC",
	date = new Date(),
) {
	return cadenceEpoch(cadence, date, timezone);
}
