import { Check, Coins, Copy, Info, RefreshCw, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

export function FundingPanel({
	wallet,
	qrCode,
	usdcBalance,
	solBalance,
	showBalanceStatus = true,
	loading,
	error,
	fundingWalletAddress,
	onCopyAddress,
	onConnectExternalWallet,
	onSendUsdc,
	onSendSol,
	onRefresh,
}: {
	wallet: string;
	qrCode?: string;
	usdcBalance: string;
	solBalance: string;
	showBalanceStatus?: boolean;
	loading: boolean;
	error?: string;
	fundingWalletAddress?: string;
	onCopyAddress: () => void | Promise<void>;
	onConnectExternalWallet: () => void;
	onSendUsdc?: (amount: number) => void | Promise<void>;
	onSendSol?: (amount: number) => void | Promise<void>;
	onRefresh: () => void | Promise<void>;
}) {
	const [copied, setCopied] = useState(false);
	const [usdcAmount, setUsdcAmount] = useState("0.1");
	const [solAmount, setSolAmount] = useState("0.003");
	const [sending, setSending] = useState<"USDC" | "SOL">();
	const [status, setStatus] = useState("");
	const [transferError, setTransferError] = useState("");

	useEffect(() => {
		if (!copied) return;
		const timer = window.setTimeout(() => setCopied(false), 2_000);
		return () => window.clearTimeout(timer);
	}, [copied]);

	async function copy() {
		await onCopyAddress();
		setCopied(true);
	}

	async function send(asset: "USDC" | "SOL") {
		const amount = Number(asset === "USDC" ? usdcAmount : solAmount);
		const sender = asset === "USDC" ? onSendUsdc : onSendSol;
		if (!Number.isFinite(amount) || amount <= 0) {
			setTransferError(`Enter a valid ${asset} amount.`);
			return;
		}
		if (!sender) {
			setTransferError(`Connect an external wallet before sending ${asset}.`);
			return;
		}
		setSending(asset);
		setStatus("");
		setTransferError("");
		try {
			await sender(amount);
			setStatus(
				`${asset} transfer submitted. Balance will update after confirmation.`,
			);
		} catch (caught) {
			setTransferError(
				caught instanceof Error ? caught.message : `${asset} transfer failed.`,
			);
		} finally {
			setSending(undefined);
		}
	}

	return (
		<div className="funding-panel">
			<div className="account-top-up-providers">
				<section className="account-top-up-provider">
					<div className="account-top-up-provider-heading">
						<span className="account-top-up-provider-icon" aria-hidden="true">
							<Coins />
						</span>
						<div>
							<strong>Direct transfer</strong>
							<small>Send USDC and SOL directly on Solana.</small>
						</div>
					</div>
					<div className="account-top-up-wallet">
						{qrCode ? (
							<img
								className="account-top-up-qr"
								src={qrCode}
								alt="QR code for the Invest4.fun Solana deposit address"
							/>
						) : null}
						<span>Deposit address</span>
						<code>{wallet}</code>
						<button
							type="button"
							className="button button-top-up account-top-up-copy"
							onClick={() => void copy()}
						>
							{copied ? (
								<>
									Copied <Check aria-hidden="true" />
								</>
							) : (
								<>
									Copy address <Copy aria-hidden="true" />
								</>
							)}
						</button>
					</div>
				</section>

				<section className="account-top-up-provider funding-transfer-panel">
					<div className="account-top-up-provider-heading">
						<span className="account-top-up-provider-icon" aria-hidden="true">
							<Wallet />
						</span>
						<div>
							<strong>Transfer from external wallet</strong>
							<small>
								{fundingWalletAddress
									? shortAddress(fundingWalletAddress)
									: "Connect an existing Solana wallet first."}
							</small>
						</div>
					</div>
					{fundingWalletAddress ? (
						<div className="funding-transfer-actions">
							<label>
								<span>Deposit USDC</span>
								<input
									type="number"
									min="0.01"
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
					) : (
						<button
							type="button"
							className="button button-outline"
							onClick={onConnectExternalWallet}
						>
							Connect Solana wallet
						</button>
					)}
				</section>
			</div>

			{showBalanceStatus ? (
				<div className="funding-balance-status">
					<span>{usdcBalance} USDC</span>
					<span>{solBalance} SOL</span>
					<button
						type="button"
						className="button button-outline"
						onClick={() => void onRefresh()}
						disabled={loading}
					>
						{loading ? "Checking balance…" : "Refresh balance"}{" "}
						<RefreshCw aria-hidden="true" />
					</button>
				</div>
			) : null}
			{status ? (
				<p className="funding-status" role="status">
					{status}
				</p>
			) : null}
			{transferError || error ? (
				<p className="error-message" role="alert">
					{transferError || error}
				</p>
			) : null}
			<p className="account-top-up-note">
				<Info aria-hidden="true" />
				<span>
					Only send USDC and SOL on the Solana network to this address. USDC
					funds purchases; SOL pays network fees.
				</span>
			</p>
		</div>
	);
}

function shortAddress(address: string) {
	return address.length > 16
		? `${address.slice(0, 7)}…${address.slice(-6)}`
		: address;
}
