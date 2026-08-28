import { ArrowRight, Copy, RefreshCw, Wallet } from "lucide-react";
import { useState } from "react";
import type { WalletFundingState } from "../wallet-funding";

export function FundingScreen({
	wallet,
	state,
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
	const [usdcAmount, setUsdcAmount] = useState("0.1");
	const [solAmount, setSolAmount] = useState("0.003");
	const [sending, setSending] = useState<"USDC" | "SOL">();
	const [transferError, setTransferError] = useState("");

	async function send(asset: "USDC" | "SOL") {
		const amount = Number(asset === "USDC" ? usdcAmount : solAmount);
		if (!Number.isFinite(amount) || amount <= 0) {
			setTransferError(`Enter a valid ${asset} amount.`);
			return;
		}
		setSending(asset);
		setTransferError("");
		try {
			await (asset === "USDC" ? onSendUsdc?.(amount) : onSendSol?.(amount));
		} catch (caught) {
			setTransferError(
				caught instanceof Error ? caught.message : `${asset} transfer failed.`,
			);
		} finally {
			setSending(undefined);
		}
	}
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

			<section className="account-balance funding-balance-card">
				<div>
					<span className="account-label">Current balance</span>
					<strong>{usdcBalance} USDC</strong>
					<small>{solBalance} SOL available for fees</small>
				</div>
				<div className="account-address">
					{qrCode ? <img src={qrCode} alt="Solana deposit QR code" /> : null}
					<code>{wallet}</code>
					<button
						type="button"
						className="button button-outline"
						onClick={onCopyAddress}
					>
						Copy address <Copy aria-hidden="true" />
					</button>
				</div>
			</section>
			{error ? (
				<div className="error-message" role="alert">
					{error}
				</div>
			) : null}

			{!ready && fundingWalletAddress ? (
				<section className="account-top-up-provider funding-transfer-panel">
					<div className="account-top-up-provider-heading">
						<Wallet aria-hidden="true" />
						<div>
							<strong>Transfer from external wallet</strong>
							<small>{fundingWalletAddress}</small>
						</div>
					</div>
					<div className="funding-transfer-actions">
						<label>
							<span>Deposit USDC</span>
							<input
								type="number"
								min="0.1"
								step="0.01"
								value={usdcAmount}
								onChange={(event) => setUsdcAmount(event.target.value)}
							/>
							<button
								type="button"
								className="button button-primary"
								onClick={() => void send("USDC")}
								disabled={Boolean(sending)}
							>
								{sending === "USDC" ? "Sending…" : "Send USDC"}
							</button>
						</label>
						<label>
							<span>Add SOL for network fees</span>
							<input
								type="number"
								min="0.001"
								step="0.001"
								value={solAmount}
								onChange={(event) => setSolAmount(event.target.value)}
							/>
							<button
								type="button"
								className="button button-outline"
								onClick={() => void send("SOL")}
								disabled={Boolean(sending)}
							>
								{sending === "SOL" ? "Sending…" : "Send SOL"}
							</button>
						</label>
					</div>
					{transferError ? <p role="alert">{transferError}</p> : null}
				</section>
			) : null}

			<div className="funding-screen-actions">
				{ready ? (
					<button
						type="button"
						className="button button-primary"
						onClick={onContinue}
					>
						Continue to feed <ArrowRight aria-hidden="true" />
					</button>
				) : !fundingWalletAddress ? (
					<button
						type="button"
						className="button button-primary"
						onClick={onConnectExternalWallet}
					>
						Connect Solana wallet <Wallet aria-hidden="true" />
					</button>
				) : null}
				<button
					type="button"
					className="button button-outline"
					onClick={onRefresh}
					disabled={loading}
				>
					{loading ? "Checking balance…" : "Refresh balance"}{" "}
					<RefreshCw aria-hidden="true" />
				</button>
				{!ready ? (
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
