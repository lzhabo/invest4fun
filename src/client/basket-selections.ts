import { type Candidate, ticketSizeToBaseUnits } from "../domain/schemas.js";

export interface ExecutionLeg {
	candidate: Candidate;
	amountInBaseUnits: string;
}

export function feedBasketSelections(
	selected: Candidate[],
	ticketSizeUsd: number,
): ExecutionLeg[] {
	const amountInBaseUnits = ticketSizeToBaseUnits(ticketSizeUsd).toString();
	return selected.map((candidate) => ({
		candidate,
		amountInBaseUnits,
	}));
}
