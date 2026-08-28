export async function checkFundingWithin<T>(
	run: (signal: AbortSignal) => Promise<T | undefined>,
	timeoutMs: number,
): Promise<{ status: "resolved"; value: T } | { status: "unavailable" }> {
	const controller = new AbortController();
	let timeout: ReturnType<typeof setTimeout> | undefined;
	const unavailable = { status: "unavailable" as const };
	try {
		return await Promise.race([
			run(controller.signal)
				.then((value) =>
					value === undefined
						? unavailable
						: { status: "resolved" as const, value },
				)
				.catch(() => unavailable),
			new Promise<typeof unavailable>((resolve) => {
				timeout = setTimeout(() => {
					controller.abort();
					resolve(unavailable);
				}, timeoutMs);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}
