import { formatUnits } from "viem";
import type { WalletFundingBalance } from "./wallet-funding.js";

export interface FundingReceiptNotification {
	asset: "USDC" | "SOL";
	amount: string;
}

export function fundingReceiptNotifications(
	previous: WalletFundingBalance | undefined,
	next: WalletFundingBalance,
): FundingReceiptNotification[] {
	if (!previous) return [];
	const receipts: FundingReceiptNotification[] = [];
	const usdcDelta =
		safeBigInt(next.usdcBalanceBaseUnits) -
		safeBigInt(previous.usdcBalanceBaseUnits);
	if (usdcDelta > 0n) {
		receipts.push({
			asset: "USDC",
			amount: formatUnits(usdcDelta, next.usdcDecimals),
		});
	}
	const solDelta =
		safeBigInt(next.solBalanceLamports) -
		safeBigInt(previous.solBalanceLamports);
	if (solDelta > 0n) {
		receipts.push({ asset: "SOL", amount: formatUnits(solDelta, 9) });
	}
	return receipts;
}

function safeBigInt(value: string) {
	try {
		return BigInt(value);
	} catch {
		return 0n;
	}
}
