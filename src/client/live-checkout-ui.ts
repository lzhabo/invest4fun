export function liveCheckoutUi({
	liveExecution,
	liveBroadcastEnabled,
}: {
	liveExecution: boolean;
	liveBroadcastEnabled: boolean;
}) {
	if (!liveExecution) {
		return {
			disabled: false,
			label: "Demo execution",
			warning: "No real funds will move.",
		};
	}
	if (!liveBroadcastEnabled) {
		return {
			disabled: true,
			label: "Live purchases temporarily unavailable",
			warning: "Transaction broadcasting is currently disabled.",
		};
	}
	return {
		disabled: false,
		label: "Mainnet · Real funds",
		warning: "Your wallet will sign and broadcast a real Solana transaction.",
	};
}
