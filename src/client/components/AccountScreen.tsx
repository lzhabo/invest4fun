import {
	ArrowDownToLine,
	CalendarDays,
	Check,
	CheckCircle2,
	ChevronRight,
	Coins,
	Copy,
	FileCode2,
	Info,
	Landmark,
	ListOrdered,
	Moon,
	PiggyBank,
	RefreshCw,
	Scale,
	Sun,
	Tag,
	Wallet,
	X,
} from "lucide-react";
import {
	type ConnectedStandardSolanaWallet,
	useSignAndSendTransaction,
} from "@privy-io/react-auth/solana";
import { toDataURL } from "qrcode";
import { Dialog } from "radix-ui";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { formatUnits } from "viem";
import { SOLANA_USDC_MINT } from "../../domain/solana";
import type {
	ExecutionProviderId,
	FeedRankingProviderId,
	OnboardingPreferences,
} from "../../domain/schemas";
import { formatTicketSizeUsd, isTicketSizeUsd } from "../../domain/schemas";
import { api } from "../api";
import {
	buildSolFundingTransaction,
	buildUsdcFundingTransaction,
} from "../funding-transactions";
import type { AppTheme } from "../theme-settings";
import { AccountBalanceSkeleton } from "./PageSkeletons";

const CADENCE_OPTIONS = ["daily", "weekly", "monthly"] as const;
const RISK_OPTIONS = ["conservative", "balanced", "degen"] as const;
export function AccountScreen({
	wallet,
	fundingWallet,
	preferences,
	theme,
	executionProviders,
	feedRankingProviders,
	onConnectExternalWallet,
	onSave,
	onSaveTheme,
}: {
	wallet: string;
	fundingWallet?: ConnectedStandardSolanaWallet;
	preferences: OnboardingPreferences;
	theme: AppTheme;
	executionProviders: {
		JUPITER: { available: boolean };
	};
	feedRankingProviders: Record<FeedRankingProviderId, { available: boolean }>;
	onConnectExternalWallet: () => void;
	onSave: (preferences: OnboardingPreferences) => Promise<void>;
	onSaveTheme: (theme: AppTheme) => void;
}) {
	const { signAndSendTransaction } = useSignAndSendTransaction();
	const [draft, setDraft] = useState(preferences);
	const [balance, setBalance] = useState<string>();
	const [solBalance, setSolBalance] = useState<string>();
	const [solPriceUsd, setSolPriceUsd] = useState<number>();
	const [balanceError, setBalanceError] = useState("");
	const [saveError, setSaveError] = useState("");
	const [saving, setSaving] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [systemSettingsOpen, setSystemSettingsOpen] = useState(false);
	const [themeDraft, setThemeDraft] = useState(theme);
	const [solanaTopUpOpen, setSolanaTopUpOpen] = useState(false);
	const [addressCopied, setAddressCopied] = useState<"smart" | "funding">();
	const [depositQrCode, setDepositQrCode] = useState("");
	const [usdcFundingAmount, setUsdcFundingAmount] = useState("10");
	const [solFundingAmount, setSolFundingAmount] = useState("0.01");
	const [fundingAction, setFundingAction] = useState<"USDC" | "SOL">();
	const [fundingStatus, setFundingStatus] = useState("");
	const [fundingError, setFundingError] = useState("");

	useEffect(() => setDraft(preferences), [preferences]);
	useEffect(() => setThemeDraft(theme), [theme]);

	const refreshBalance = useCallback(async () => {
		if (!wallet) return;
		setBalanceError("");
		try {
			const {
				usdcBalanceBaseUnits,
				usdcDecimals,
				solBalanceLamports,
				solPriceUsd: nextSolPriceUsd,
			} = await api.solanaBalance(wallet);
			setBalance(formatUnits(BigInt(usdcBalanceBaseUnits), usdcDecimals));
			setSolBalance(formatUnits(BigInt(solBalanceLamports), 9));
			setSolPriceUsd(nextSolPriceUsd);
		} catch (caught) {
			setBalanceError(
				caught instanceof Error ? caught.message : "Could not read USDC balance.",
			);
		}
	}, [wallet]);

	useEffect(() => {
		if (!wallet) {
			setBalance(undefined);
			setSolBalance(undefined);
			setSolPriceUsd(undefined);
			setBalanceError("");
			return;
		}
		setBalance(undefined);
		setSolBalance(undefined);
		setSolPriceUsd(undefined);
		void refreshBalance();
	}, [refreshBalance, wallet]);

	useEffect(() => {
		if (!solanaTopUpOpen || !wallet) return;
		void refreshBalance();
		const timer = window.setInterval(() => void refreshBalance(), 5_000);
		return () => window.clearInterval(timer);
	}, [refreshBalance, solanaTopUpOpen, wallet]);

	useEffect(() => {
		if (!solanaTopUpOpen || !wallet) {
			setDepositQrCode("");
			return;
		}
		let cancelled = false;
		void toDataURL(`solana:${wallet}`, { margin: 1, width: 184 }).then((url) => {
			if (!cancelled) setDepositQrCode(url);
		});
		return () => {
			cancelled = true;
		};
	}, [solanaTopUpOpen, wallet]);

	async function save() {
		setSaveError("");
		setSaving(true);
		try {
			const next = {
				...draft,
				feedRankingProvider: feedRankingProviders.ZERO_G.available
					? draft.feedRankingProvider
					: ("DETERMINISTIC" as const),
				riskDisclosureAccepted: true as const,
			};
			onSaveTheme(themeDraft);
			await onSave(next);
			setSettingsOpen(false);
			setSystemSettingsOpen(false);
		} catch (caught) {
			setSaveError(
				caught instanceof Error ? caught.message : "Could not save settings.",
			);
		} finally {
			setSaving(false);
		}
	}

	async function copyAddress(address: string, type: "smart" | "funding") {
		if (!address) return;
		try {
			await navigator.clipboard.writeText(address);
		} catch {
			const textarea = document.createElement("textarea");
			textarea.value = address;
			textarea.style.position = "fixed";
			textarea.style.opacity = "0";
			document.body.append(textarea);
			textarea.select();
			document.execCommand("copy");
			textarea.remove();
		}
		setAddressCopied(type);
		window.setTimeout(() => setAddressCopied(undefined), 1_800);
	}

	function topUp() {
		if (!wallet) return;
		setFundingError("");
		setFundingStatus("");
		setSolanaTopUpOpen(true);
	}

	async function fundFromExternalWallet(asset: "USDC" | "SOL") {
		if (!fundingWallet) {
			onConnectExternalWallet();
			return;
		}
		const amount = Number(
			asset === "USDC" ? usdcFundingAmount : solFundingAmount,
		);
		if (!Number.isFinite(amount) || amount <= 0) {
			setFundingError(`Enter a valid ${asset} amount.`);
			return;
		}
		setFundingAction(asset);
		setFundingError("");
		setFundingStatus("");
		try {
			const blockhash = await api.solanaLatestBlockhash();
			const transaction =
				asset === "USDC"
					? buildUsdcFundingTransaction({
							from: fundingWallet.address,
							to: wallet,
							usdcAmount: amount,
							blockhash,
							mint: SOLANA_USDC_MINT,
						})
					: buildSolFundingTransaction({
							from: fundingWallet.address,
							to: wallet,
							solAmount: amount,
							blockhash,
						});
			await signAndSendTransaction({
				transaction,
				wallet: fundingWallet,
				chain: "solana:mainnet",
				options: {
					uiOptions: {
						description: `Transfer ${amount} ${asset} to your Invest4.fun wallet.`,
						buttonText: `Send ${asset}`,
					},
				},
			});
			setFundingStatus(
				`${asset} transfer submitted. Balance will update after confirmation.`,
			);
			await refreshBalance();
		} catch (caught) {
			setFundingError(
				caught instanceof Error ? caught.message : `${asset} transfer failed.`,
			);
		} finally {
			setFundingAction(undefined);
		}
	}

	function closeSettings(open: boolean) {
		if (saving) return;
		setSettingsOpen(open);
		if (!open) {
			setDraft(preferences);
			setThemeDraft(theme);
			setSaveError("");
		}
	}

	function closeSystemSettings(open: boolean) {
		if (saving) return;
		setSystemSettingsOpen(open);
		if (!open) {
			setDraft(preferences);
			setThemeDraft(theme);
			setSaveError("");
		}
	}

	return (
		<main className="account-page">
			<header className="account-heading">
				<h1>Ready to invest.</h1>
				<p>
					Everything you need to manage your wallets, settings and investments
					rules.
				</p>
			</header>

			<section className="account-balance" aria-labelledby="balance-title">
				<div>
					<span className="account-label" id="balance-title">
						Invest4.fun wallet
					</span>
					<strong>
						{balance === undefined ? (
							balanceError ? (
								"—"
							) : wallet ? (
								<AccountBalanceSkeleton />
							) : (
								"—"
							)
						) : (
							`${formatInvestingBalance(balance)} USDC`
						)}
					</strong>
					{solBalance !== undefined ? (
						<small>
							{formatAccountBalance(solBalance)} SOL
							{solPriceUsd === undefined
								? ""
								: ` (${formatUsdValue(Number(solBalance) * solPriceUsd)})`} available
							for fees
						</small>
					) : null}
				</div>
				<div className="account-address">
					<div className="account-address-row">
						<code>
							{wallet ? shortAddress(wallet) : "Wallet not activated"}
						</code>
						{wallet ? (
							<button
								type="button"
								className="copy-address"
								aria-label={
									addressCopied === "smart"
										? "Address copied"
										: "Copy Invest4.fun wallet address"
								}
								title={addressCopied === "smart" ? "Copied" : "Copy address"}
								onClick={() => void copyAddress(wallet, "smart")}
							>
								{addressCopied === "smart" ? (
									<Check aria-hidden="true" />
								) : (
									<Copy aria-hidden="true" />
								)}
							</button>
						) : null}
					</div>
					<button
						type="button"
						className="button button-top-up"
						onClick={topUp}
						disabled={!wallet}
					>
						Top up <ArrowDownToLine aria-hidden="true" />
					</button>
				</div>
			</section>

			<Dialog.Root open={solanaTopUpOpen} onOpenChange={setSolanaTopUpOpen}>
				<Dialog.Portal>
					<Dialog.Overlay className="send-dialog-overlay" />
					<Dialog.Content className="send-dialog-content account-top-up-dialog">
						<div className="send-dialog-header">
							<div>
								<span className="account-label">Solana wallet</span>
								<Dialog.Title>Top up USDC</Dialog.Title>
								<Dialog.Description>
									Choose how to deposit USDC into your Invest4.fun wallet.
								</Dialog.Description>
							</div>
							<Dialog.Close asChild>
								<button
									type="button"
									className="send-dialog-close"
									aria-label="Close top up"
								>
									<X aria-hidden="true" />
								</button>
							</Dialog.Close>
						</div>
						<div className="account-top-up-providers">
							<section className="account-top-up-provider">
								<div className="account-top-up-provider-heading">
									<span className="account-top-up-provider-icon" aria-hidden="true">
										<Coins />
									</span>
									<div>
										<strong>Direct transfer</strong>
										<small>Send USDC directly on Solana.</small>
									</div>
								</div>
								<div className="account-top-up-wallet">
									{depositQrCode ? (
										<img
											className="account-top-up-qr"
											src={depositQrCode}
											alt="QR code for the Invest4.fun Solana deposit address"
										/>
									) : null}
									<span>Deposit address</span>
									<code>{wallet}</code>
									<button
										type="button"
										className="button button-top-up account-top-up-copy"
										onClick={() => void copyAddress(wallet, "smart")}
									>
										{addressCopied === "smart" ? (
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
											{fundingWallet
												? shortAddress(fundingWallet.address)
												: "Connect an existing Solana wallet first."}
										</small>
									</div>
								</div>
								{fundingWallet ? (
									<div className="funding-transfer-actions">
										<label>
											<span>Deposit USDC</span>
											<input
												type="number"
												min="0.1"
												step="0.01"
												value={usdcFundingAmount}
												onChange={(event) => setUsdcFundingAmount(event.target.value)}
											/>
											<button
												type="button"
												className="button button-primary"
												onClick={() => void fundFromExternalWallet("USDC")}
												disabled={Boolean(fundingAction)}
											>
												{fundingAction === "USDC" ? "Sending…" : "Send USDC"}
											</button>
										</label>
										<label>
											<span>Add SOL for network fees</span>
											<input
												type="number"
												min="0.001"
												step="0.001"
												value={solFundingAmount}
												onChange={(event) => setSolFundingAmount(event.target.value)}
											/>
											<button
												type="button"
												className="button button-outline"
												onClick={() => void fundFromExternalWallet("SOL")}
												disabled={Boolean(fundingAction)}
											>
												{fundingAction === "SOL" ? "Sending…" : "Send SOL"}
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
						<div className="funding-balance-status">
							<span>
								{balance === undefined ? "—" : `${formatInvestingBalance(balance)} USDC`}
							</span>
							<span>
								{solBalance === undefined ? "—" : `${formatAccountBalance(solBalance)} SOL`}
							</span>
							<button
								type="button"
								className="button button-outline"
								onClick={() => void refreshBalance()}
							>
								Refresh balance <RefreshCw aria-hidden="true" />
							</button>
						</div>
						{fundingStatus ? (
							<p className="funding-status" role="status">
								{fundingStatus}
							</p>
						) : null}
						{fundingError ? (
							<p className="error-message" role="alert">
								{fundingError}
							</p>
						) : null}
						<p className="account-top-up-note">
							<Info aria-hidden="true" />
							<span>
								Only send USDC on Solana to this address. Keep some SOL in the
								wallet for network fees.
							</span>
						</p>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>

			<section
				className="account-command-section account-wallet-section"
				aria-labelledby="wallet-title"
			>
				<h2 id="wallet-title">Wallets</h2>
				<div className="account-wallet-list">
					<article className="account-wallet-row">
						<div className="account-row-copy">
							<div className="account-wallet-primary">
								<span className="account-wallet-icon" aria-hidden="true">
									<Landmark />
								</span>
								<strong>Invest4.fun wallet</strong>
								<span className="account-network">
									Solana Mainnet
								</span>
							</div>
							<small>
								<CheckCircle2 aria-hidden="true" /> Executes approved
								investments.
							</small>
						</div>
					</article>

					<article className="account-wallet-row">
						<div className="account-row-copy">
							<div className="account-wallet-primary">
								<span className="account-wallet-icon" aria-hidden="true">
									<Wallet />
								</span>
								<strong>External wallet</strong>
								{fundingWallet ? (
									<span className="account-wallet-status">Connected</span>
								) : (
									<button
										type="button"
										className="account-edit-button"
										onClick={onConnectExternalWallet}
									>
										Connect
									</button>
								)}
							</div>
							<small>
								<Info aria-hidden="true" /> Funding only. Never executes
								investments.
							</small>
						</div>
					</article>
				</div>
			</section>

			<section
				className="account-command-section account-feed-settings-section"
				aria-labelledby="settings-title"
			>
				<div className="account-command-heading">
					<h2 id="settings-title">Feed settings</h2>
					<button
						type="button"
						className="account-edit-button"
						aria-expanded={settingsOpen}
						onClick={() => setSettingsOpen(true)}
					>
						Edit <ChevronRight aria-hidden="true" />
					</button>
				</div>

				<div className="account-rules-list">
					<div>
						<CalendarDays aria-hidden="true" />
						<span>Invest limit renewal</span>
						<strong>
							Every{" "}
							{draft.cadence === "daily"
								? "day"
								: draft.cadence === "weekly"
									? "week"
									: "month"}
						</strong>
					</div>
					<div>
						<PiggyBank aria-hidden="true" />
						<span>Invest limit amount</span>
						<strong>${formatTicketSizeUsd(draft.periodLimitUsd ?? 100)}</strong>
					</div>
					<div>
						<Tag aria-hidden="true" />
						<span>Default card amount</span>
						<strong>${formatTicketSizeUsd(draft.ticketSizeUsd)}</strong>
					</div>
					<div>
						<Scale aria-hidden="true" />
						<span>Risk profile</span>
						<strong className="text-capitalize">{draft.riskMode}</strong>
					</div>
					<div>
						<Coins aria-hidden="true" />
						<span>Asset focus</span>
						<strong>
							{draft.assetClasses.length === 2
								? "Crypto + tokenized stocks"
								: draft.assetClasses[0] === "CRYPTO"
									? "Crypto"
									: draft.assetClasses[0] === "STOCK_TOKEN"
										? "Tokenized stocks"
										: "None selected"}
						</strong>
					</div>
				</div>

				<Dialog.Root open={settingsOpen} onOpenChange={closeSettings}>
					<Dialog.Portal>
						<Dialog.Overlay className="send-dialog-overlay" />
						<Dialog.Content className="send-dialog-content account-settings-dialog">
							<div className="send-dialog-header">
								<div>
									<span className="account-label">Feed settings</span>
									<Dialog.Title>Edit investing rules</Dialog.Title>
									<Dialog.Description>
										Change the preferences that shape your next investment
										session.
									</Dialog.Description>
								</div>
								<Dialog.Close asChild>
									<button
										type="button"
										className="send-dialog-close"
										aria-label="Close investment settings"
										disabled={saving}
									>
										<X aria-hidden="true" />
									</button>
								</Dialog.Close>
							</div>

							<div className="account-settings account-settings-form">
								<div className="settings-field">
									<span>Invest limit renewal</span>
									<SelectMenu
										ariaLabel="Invest limit renewal. A new session is available once per selected period."
										value={draft.cadence}
										options={CADENCE_OPTIONS.map((cadence) => ({
											value: cadence,
											label: `Every ${cadence === "daily" ? "day" : cadence === "weekly" ? "week" : "month"}`,
										}))}
										onChange={(cadence) =>
											setDraft((current) => ({
												...current,
												cadence: cadence as OnboardingPreferences["cadence"],
											}))
										}
									/>
									<small>
										A new session is available once per selected period.
									</small>
								</div>

								<label className="settings-field">
									<span>Default card amount</span>
									<div className="ticket-input">
										<b>$</b>
										<input
											type="number"
											min="0.1"
											max={draft.periodLimitUsd ?? 100}
											step="0.01"
											inputMode="decimal"
											value={formatTicketSizeUsd(draft.ticketSizeUsd)}
											onChange={(event) =>
												setDraft((current) => ({
													...current,
													ticketSizeUsd: clampTicket(event.target.value),
												}))
											}
										/>
									</div>
									<small>
									USDC amount
										from $0.10 to $
										{formatTicketSizeUsd(draft.periodLimitUsd ?? 100)}, in $0.01
										increments.
									</small>
								</label>

								<fieldset className="settings-field">
									<legend>Risk preference</legend>
									<div className="settings-options">
										{RISK_OPTIONS.map((risk) => (
											<label
												key={risk}
												className={draft.riskMode === risk ? "selected" : ""}
											>
												<input
													type="radio"
													name="risk"
													checked={draft.riskMode === risk}
													onChange={() =>
														setDraft((current) => ({
															...current,
															riskMode: risk,
														}))
													}
												/>
												<b>{risk}</b>
											</label>
										))}
									</div>
								</fieldset>

								<fieldset className="settings-field">
									<legend>Assets to include</legend>
									<div className="settings-options">
										{(["CRYPTO", "STOCK_TOKEN"] as const).map((assetClass) => {
											const selected = draft.assetClasses.includes(assetClass);
											return (
												<label
													key={assetClass}
													className={selected ? "selected" : ""}
												>
													<input
														type="checkbox"
														checked={selected}
														onChange={() =>
															setDraft((current) => ({
																...current,
																assetClasses: selected
																	? current.assetClasses.filter(
																			(item) => item !== assetClass,
																		)
																	: [...current.assetClasses, assetClass],
															}))
														}
													/>
													<b>
														{assetClass === "CRYPTO"
															? "Crypto"
															: "Tokenized stocks"}
													</b>
												</label>
											);
										})}
									</div>
									{!draft.assetClasses.length ? (
										<small className="settings-error">
											Choose at least one asset type.
										</small>
									) : null}
								</fieldset>

								<div className="settings-actions">
									{saveError ? <p role="alert">{saveError}</p> : null}
									<Dialog.Close asChild>
										<button
											type="button"
											className="button button-outline"
											disabled={saving}
										>
											Cancel
										</button>
									</Dialog.Close>
									<button
										type="button"
										className="button button-primary"
										disabled={saving || !draft.assetClasses.length}
										onClick={save}
									>
										{saving ? "Saving…" : "Save and refresh my feed"}
									</button>
								</div>
							</div>
						</Dialog.Content>
					</Dialog.Portal>
				</Dialog.Root>
			</section>

			<section
				className="account-command-section account-app-settings-section"
				aria-labelledby="system-settings-title"
			>
				<div className="account-command-heading">
					<h2 id="system-settings-title">App settings</h2>
					<button
						type="button"
						className="account-edit-button"
						aria-expanded={systemSettingsOpen}
						onClick={() => setSystemSettingsOpen(true)}
					>
						Edit <ChevronRight aria-hidden="true" />
					</button>
				</div>
				<div className="account-rules-list">
					<div>
						{theme === "dark" ? (
							<Moon aria-hidden="true" />
						) : (
							<Sun aria-hidden="true" />
						)}
						<span>Theme</span>
						<strong>{theme === "dark" ? "Dark" : "Light"}</strong>
					</div>
					<div>
						<FileCode2 aria-hidden="true" />
						<span>Execution provider</span>
						<strong>{executionProviderLabel(draft.executionProvider)}</strong>
					</div>
					<div>
						<ListOrdered aria-hidden="true" />
						<span>Feed ranking</span>
						<strong>
							{draft.feedRankingProvider === "ZERO_G" &&
							feedRankingProviders.ZERO_G.available
								? "Private AI via 0G"
								: "Deterministic"}
						</strong>
					</div>
				</div>

				<Dialog.Root
					open={systemSettingsOpen}
					onOpenChange={closeSystemSettings}
				>
					<Dialog.Portal>
						<Dialog.Overlay className="send-dialog-overlay" />
						<Dialog.Content className="send-dialog-content account-settings-dialog">
							<div className="send-dialog-header">
								<div>
									<span className="account-label">App settings</span>
									<Dialog.Title>Appearance, feed and execution</Dialog.Title>
									<Dialog.Description>
										Choose the palette for this network, how assets are ranked,
										and where swaps are executed.
									</Dialog.Description>
								</div>
								<Dialog.Close asChild>
									<button
										type="button"
										className="send-dialog-close"
										aria-label="Close settings"
										disabled={saving}
									>
										<X aria-hidden="true" />
									</button>
								</Dialog.Close>
							</div>

							<div className="account-settings account-settings-form">
								<fieldset className="settings-field execution-provider-setting">
									<legend>Theme</legend>
									<p>
										Set the look for{" "}
										Solana
										. This does not change networks.
									</p>
									<div className="execution-provider-options theme-palette-options">
										{(
											[
												{
													id: "light",
													name: "Light",
													description:
													"Bright surfaces with lime accents.",
												},
												{
													id: "dark",
													name: "Dark",
													description:
														"Solana palette with near-black surfaces and mint accents.",
												},
											] as const
										).map((option) => (
											<label
												key={option.id}
												className={themeDraft === option.id ? "selected" : ""}
											>
												<input
													type="radio"
													name="theme-palette"
													checked={themeDraft === option.id}
													onChange={() => setThemeDraft(option.id)}
												/>
												<span>
													<b>{option.name}</b>
													<small>{option.description}</small>
												</span>
											</label>
										))}
									</div>
								</fieldset>

								<fieldset className="settings-field execution-provider-setting">
									<legend>Execution provider</legend>
									<p>Choose where Investmade finds and executes your swaps.</p>
									<div className="execution-provider-options">
										{(
													[
														{
															id: "JUPITER",
															name: "Jupiter",
															description:
																"Jupiter liquidity and routing on Solana.",
														},
													] as const
												).map((provider) => {
													const available =
														executionProviders[provider.id].available;
													return (
														<label
															key={provider.id}
															className={
																draft.executionProvider === provider.id
																	? "selected"
																	: ""
															}
														>
															<input
																type="radio"
																name="execution-provider"
																checked={
																	draft.executionProvider === provider.id
																}
																disabled={!available}
																onChange={() =>
																	setDraft((current) => ({
																		...current,
																		executionProvider: provider.id,
																		solanaExecutionProvider: provider.id,
																	}))
																}
															/>
															<span>
																<b>{provider.name}</b>
																<small>{provider.description}</small>
																{!available ? (
																	<em>API not configured</em>
																) : null}
															</span>
														</label>
													);
												})}
									</div>
									<small>
										Changing provider applies to your next basket. Prepared
										quotes will be refreshed.
									</small>
								</fieldset>

								<label className="settings-field feed-ranking-setting">
									<span>Use 0G private AI ranking</span>
									<input
										type="checkbox"
										role="switch"
										checked={
											feedRankingProviders.ZERO_G.available &&
											draft.feedRankingProvider === "ZERO_G"
										}
										aria-checked={
											feedRankingProviders.ZERO_G.available &&
											draft.feedRankingProvider === "ZERO_G"
										}
										disabled={!feedRankingProviders.ZERO_G.available}
										onChange={(event) =>
											setDraft((current) => ({
												...current,
												feedRankingProvider: event.target.checked
													? "ZERO_G"
													: "DETERMINISTIC",
											}))
										}
									/>
									<small>
										{feedRankingProviders.ZERO_G.available
											? "Turn off to rank locally without making an outbound 0G request."
											: "0G is unavailable. Deterministic ranking will be used."}
									</small>
								</label>

								<div className="settings-actions">
									{saveError ? <p role="alert">{saveError}</p> : null}
									<Dialog.Close asChild>
										<button
											type="button"
											className="button button-outline"
											disabled={saving}
										>
											Cancel
										</button>
									</Dialog.Close>
									<button
										type="button"
										className="button button-primary"
										disabled={saving}
										onClick={save}
									>
										{saving ? "Saving…" : "Save and refresh my feed"}
									</button>
								</div>
							</div>
						</Dialog.Content>
					</Dialog.Portal>
				</Dialog.Root>
			</section>
		</main>
	);
}

function SelectMenu({
	ariaLabel,
	value,
	options,
	onChange,
}: {
	ariaLabel: string;
	value: string;
	options: Array<{ value: string; label: string }>;
	onChange: (value: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
	const listboxId = useId();
	const selected =
		options.find((option) => option.value === value) ?? options[0];
	const selectedIndex = Math.max(
		0,
		options.findIndex((option) => option.value === selected?.value),
	);
	const [activeIndex, setActiveIndex] = useState(selectedIndex);

	useEffect(() => {
		if (!open) {
			setActiveIndex(selectedIndex);
			return;
		}
		optionRefs.current[activeIndex]?.focus();
	}, [activeIndex, open, selectedIndex]);

	function openAt(index: number) {
		if (!options.length) return;
		setActiveIndex(Math.max(0, Math.min(options.length - 1, index)));
		setOpen(true);
	}

	function closeAndRestoreFocus() {
		setOpen(false);
		triggerRef.current?.focus();
	}

	function selectOption(index: number) {
		const option = options[index];
		if (!option) return;
		onChange(option.value);
		closeAndRestoreFocus();
	}

	function moveOption(index: number) {
		if (!options.length) return;
		const nextIndex = (index + options.length) % options.length;
		setActiveIndex(nextIndex);
	}

	return (
		<div className="select-menu">
			<button
				ref={triggerRef}
				type="button"
				className="select-trigger"
				aria-label={ariaLabel}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-controls={listboxId}
				onClick={() => {
					if (open) {
						setOpen(false);
						return;
					}
					openAt(selectedIndex);
				}}
				onKeyDown={(event) => {
					if (event.key === "ArrowDown") {
						event.preventDefault();
						openAt(open ? activeIndex + 1 : selectedIndex);
					} else if (event.key === "ArrowUp") {
						event.preventDefault();
						openAt(open ? activeIndex - 1 : selectedIndex);
					} else if (event.key === "Home") {
						event.preventDefault();
						openAt(0);
					} else if (event.key === "End") {
						event.preventDefault();
						openAt(options.length - 1);
					} else if (event.key === "Escape" && open) {
						event.preventDefault();
						setOpen(false);
					}
				}}
			>
				<span>{selected?.label ?? "Select an option"}</span>
				<svg viewBox="0 0 16 10" aria-hidden="true">
					<path d="m1 1 7 7 7-7" />
				</svg>
			</button>
			{open ? (
				<div
					id={listboxId}
					className="select-options"
					role="listbox"
					aria-label={ariaLabel}
				>
					{options.map((option, index) => {
						const active = option.value === value;
						return (
							<button
								ref={(node) => {
									optionRefs.current[index] = node;
								}}
								type="button"
								role="option"
								aria-selected={active}
								className={active ? "selected" : ""}
								key={option.value}
								tabIndex={index === activeIndex ? 0 : -1}
								onClick={() => selectOption(index)}
								onKeyDown={(event) => {
									if (event.key === "ArrowDown") {
										event.preventDefault();
										moveOption(index + 1);
									} else if (event.key === "ArrowUp") {
										event.preventDefault();
										moveOption(index - 1);
									} else if (event.key === "Home") {
										event.preventDefault();
										setActiveIndex(0);
									} else if (event.key === "End") {
										event.preventDefault();
										setActiveIndex(options.length - 1);
									} else if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										selectOption(index);
									} else if (event.key === "Escape") {
										event.preventDefault();
										closeAndRestoreFocus();
									} else if (event.key === "Tab") {
										setOpen(false);
									}
								}}
							>
								{option.label}
							</button>
						);
					})}
				</div>
			) : null}
		</div>
	);
}

function clampTicket(value: string) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0.1;
	const rounded = Math.round(parsed * 100) / 100;
	return isTicketSizeUsd(rounded)
		? rounded
		: Math.max(0.1, Math.min(100, rounded));
}

function shortAddress(address: string) {
	return `${address.slice(0, 10)}…${address.slice(-8)}`;
}

function formatAccountBalance(value: string) {
	const [whole, fraction = ""] = value.split(".");
	const compactFraction = fraction.slice(0, 6).replace(/0+$/, "");
	return compactFraction ? `${whole}.${compactFraction}` : whole;
}

function formatInvestingBalance(value: string) {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric.toFixed(2) : "—";
}

function formatUsdValue(value: number) {
	return Number.isFinite(value)
		? new Intl.NumberFormat("en-US", {
				style: "currency",
				currency: "USD",
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			}).format(value)
		: "—";
}

function executionProviderLabel(provider: ExecutionProviderId) {
	return provider === "JUPITER" ? "Jupiter" : provider;
}
