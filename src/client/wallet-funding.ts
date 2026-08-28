export const RECOMMENDED_SOL_RESERVE_LAMPORTS = 3_000_000n;

export type WalletFundingState =
	| "UNFUNDED"
	| "NEEDS_USDC"
	| "NEEDS_SOL"
	| "READY";

export interface WalletFundingBalance {
	usdcBalanceBaseUnits: string;
	usdcDecimals: number;
	solBalanceLamports: string;
}

export function classifyWalletFunding(
	input: WalletFundingBalance & { ticketSizeUsd: number },
): WalletFundingState {
	const usdc = safeBigInt(input.usdcBalanceBaseUnits);
	const sol = safeBigInt(input.solBalanceLamports);
	const requiredUsdc = BigInt(
		Math.round(input.ticketSizeUsd * 10 ** input.usdcDecimals),
	);
	const hasUsdc = usdc >= requiredUsdc;
	const hasSol = sol >= RECOMMENDED_SOL_RESERVE_LAMPORTS;
	if (usdc === 0n && sol === 0n) return "UNFUNDED";
	if (!hasUsdc) return "NEEDS_USDC";
	if (!hasSol) return "NEEDS_SOL";
	return "READY";
}

export function shouldShowFunding(state: WalletFundingState) {
	return state !== "READY";
}

export function hasReceivedFunds(balance: WalletFundingBalance) {
	return (
		safeBigInt(balance.usdcBalanceBaseUnits) > 0n ||
		safeBigInt(balance.solBalanceLamports) > 0n
	);
}

export function shouldOfferTopUp(errorCode: string) {
	return errorCode === "INSUFFICIENT_FUNDS";
}

function safeBigInt(value: string) {
	try {
		return BigInt(value);
	} catch {
		return 0n;
	}
}
