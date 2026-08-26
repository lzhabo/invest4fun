import { isTicketSizeUsd } from "../domain/schemas.js";

export function parseCardAmountInput(value: string): number | undefined {
	const normalized = value.trim().replace(",", ".");
	if (!normalized || !/^\d+(?:\.\d{0,2})?$/.test(normalized)) return;
	const parsed = Number(normalized);
	return isTicketSizeUsd(parsed) ? parsed : undefined;
}
