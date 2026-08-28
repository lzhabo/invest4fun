import { CheckCircle2, X } from "lucide-react";
import type { FundingReceiptNotification } from "../funding-notifications";

export function FundingNotifications({
	receipts,
	onDismiss,
}: {
	receipts: FundingReceiptNotification[];
	onDismiss: (asset: FundingReceiptNotification["asset"]) => void;
}) {
	if (!receipts.length) return null;
	return (
		<section
			className="funding-notifications"
			aria-label="Wallet notifications"
		>
			{receipts.map((receipt) => (
				<div className="funding-notification" role="status" key={receipt.asset}>
					<CheckCircle2 aria-hidden="true" />
					<div>
						<strong>Funds received</strong>
						<span>
							{receipt.amount} {receipt.asset} received
						</span>
					</div>
					<button
						type="button"
						onClick={() => onDismiss(receipt.asset)}
						aria-label={`Dismiss ${receipt.asset} notification`}
					>
						<X aria-hidden="true" />
					</button>
				</div>
			))}
		</section>
	);
}
