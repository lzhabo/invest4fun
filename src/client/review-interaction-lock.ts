export type ReviewExecutionPhase =
	| "idle"
	| "refreshing"
	| "simulating"
	| "signing"
	| "settling";

export function reviewInteractionsLocked({
	phase,
	hasPreparedExecution,
}: {
	phase: ReviewExecutionPhase;
	hasPreparedExecution: boolean;
}) {
	return phase !== "idle" || hasPreparedExecution;
}
