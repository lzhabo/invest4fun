import { ArrowRight } from "lucide-react";
import { useEffect } from "react";
import type { WalletFundingState } from "../wallet-funding";
import { FundingPanel } from "./FundingPanel";

export function FundingScreen({
	wallet,
	state,
	fundsReceived = false,
	usdcBalance,
	solBalance,
	loading,
	error,
	qrCode,
	fundingWalletAddress,
	onCopyAddress,
	onConnectExternalWallet,
	onSendUsdc,
	onSendSol,
	onRefresh,
	onContinue,
	onBrowse,
}: {
	wallet: string;
	state: WalletFundingState;
	fundsReceived?: boolean;
	usdcBalance: string;
	solBalance: string;
	loading: boolean;
	error?: string;
	qrCode?: string;
	fundingWalletAddress?: string;
	onCopyAddress: () => void;
	onConnectExternalWallet: () => void;
	onSendUsdc?: (amount: number) => void | Promise<void>;
	onSendSol?: (amount: number) => void | Promise<void>;
	onRefresh: () => void;
	onContinue: () => void;
	onBrowse: () => void;
}) {
	const ready = state === "READY";
	const canContinue = ready || fundsReceived;
	useEffect(() => {
		const timer = window.setInterval(() => void onRefresh(), 5_000);
		return () => window.clearInterval(timer);
	}, [onRefresh]);
	return (
		<main className="account-page funding-page">
			<header className="account-heading">
				<span className="account-label">Wallet setup</span>
				<h1>
					{ready
						? "Wallet ready"
						: fundsReceived
							? "Funds received"
							: fundingTitle(state)}
				</h1>
				<p>
					USDC pays for your investments. SOL covers network fees and the first
					token-account setup.
				</p>
			</header>

			<FundingPanel
				wallet={wallet}
				qrCode={qrCode}
				usdcBalance={usdcBalance}
				solBalance={solBalance}
				loading={loading}
				error={error}
				fundingWalletAddress={fundingWalletAddress}
				onCopyAddress={onCopyAddress}
				onConnectExternalWallet={onConnectExternalWallet}
				onSendUsdc={onSendUsdc}
				onSendSol={onSendSol}
				onRefresh={onRefresh}
			/>

			<div className="funding-screen-actions">
				{canContinue ? (
					<button
						type="button"
						className="button button-primary"
						onClick={onContinue}
					>
						Continue to feed <ArrowRight aria-hidden="true" />
					</button>
				) : null}
				{!canContinue ? (
					<button
						type="button"
						className="onboarding-text-button"
						onClick={onBrowse}
					>
						Browse feed without funding
					</button>
				) : null}
			</div>
		</main>
	);
}

function fundingTitle(state: WalletFundingState) {
	if (state === "NEEDS_USDC") return "Add USDC to invest";
	if (state === "NEEDS_SOL") return "Add SOL for fees";
	return "Fund your wallet";
}
