import type { ExecutionRecord } from "./store.js";

/** Removes replayable signed payloads from every client-facing execution response. */
export function publicExecution(execution: ExecutionRecord) {
	return {
		...execution,
		legs: execution.legs.map(
			({ signedTransactionBase64: _signed, ...leg }) => leg,
		),
	};
}
