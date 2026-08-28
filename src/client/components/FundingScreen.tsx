import { ArrowRight, CheckCircle2, Circle, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import type { WalletFundingState } from "../wallet-funding";
import { FundingPanel } from "./FundingPanel";

export function FundingScreen({
	wallet,
	state,
	usdcBalance,
	solBalance,
	ticketSizeUsd = 0.1,
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
}: {
	wallet: string;
	state: WalletFundingState;
	usdcBalance: string;
	solBalance: string;
	ticketSizeUsd?: number;
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
}) {
	const ready = state === "READY";
	const usdcReady = Number(usdcBalance) >= ticketSizeUsd;
	const solReady = Number(solBalance) >= 0.003;
	useEffect(() => {
		const timer = window.setInterval(() => void onRefresh(), 5_000);
		return () => window.clearInterval(timer);
	}, [onRefresh]);
	return (
		<main className="account-page funding-page">
			<header className="account-heading">
				<span className="account-label">Wallet setup</span>
				<h1>{ready ? "Wallet ready" : fundingTitle(state)}</h1>
				<p>
					USDC pays for your investments. SOL covers network fees and the first
					token-account setup.
				</p>
			</header>
			<section className="funding-readiness" aria-label="Wallet balances">
				<div className={usdcReady ? "is-ready" : "is-needed"}>
					{usdcReady ? (
						<CheckCircle2 aria-hidden="true" />
					) : (
						<Circle aria-hidden="true" />
					)}
					<span>
						<strong>USDC for purchases</strong>
						<small>{formatRequiredUsdc(ticketSizeUsd)} USDC required</small>
					</span>
					<b>{usdcBalance} USDC</b>
				</div>
				<div className={solReady ? "is-ready" : "is-needed"}>
					{solReady ? (
						<CheckCircle2 aria-hidden="true" />
					) : (
						<Circle aria-hidden="true" />
					)}
					<span>
						<strong>SOL for network fees</strong>
						<small>0.003 SOL required</small>
					</span>
					<b>{solBalance} SOL</b>
				</div>
				<button
					type="button"
					className="button button-outline"
					onClick={onRefresh}
					disabled={loading}
				>
					{loading ? "Checking balance…" : "Refresh balance"}
					<RefreshCw aria-hidden="true" />
				</button>
			</section>

			<FundingPanel
				wallet={wallet}
				qrCode={qrCode}
				usdcBalance={usdcBalance}
				solBalance={solBalance}
				showBalanceStatus={false}
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
				{ready ? (
					<button
						type="button"
						className="button button-primary"
						onClick={onContinue}
					>
						Continue to feed <ArrowRight aria-hidden="true" />
					</button>
				) : (
					<button
						type="button"
						className="onboarding-text-button"
						onClick={onContinue}
					>
						Browse feed without funding
					</button>
				)}
			</div>
		</main>
	);
}

function formatRequiredUsdc(ticketSizeUsd: number) {
	return ticketSizeUsd.toFixed(Math.max(2, decimalPlaces(ticketSizeUsd)));
}

function decimalPlaces(value: number) {
	const fraction = value.toString().split(".")[1];
	return fraction?.length ?? 0;
}

function fundingTitle(state: WalletFundingState) {
	if (state === "NEEDS_USDC") return "Add USDC to invest";
	if (state === "NEEDS_SOL") return "Add SOL for fees";
	return "Fund your wallet";
}
