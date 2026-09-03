import {
	type ConnectedStandardSolanaWallet,
	useSignTransaction,
} from "@privy-io/react-auth/solana";
import { LoaderCircle, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUnits } from "viem";
import { assetDisplayName } from "../../domain/asset-display";
import type { Candidate } from "../../domain/schemas";
import { formatTicketSizeUsd } from "../../domain/schemas";
import type { ExecutionRecord, FeedResponse, WeeklySession } from "../api";
import { ApiError, api } from "../api";
import { liveCheckoutUi } from "../live-checkout-ui";
import {
	reviewInteractionsLocked,
	type ReviewExecutionPhase,
} from "../review-interaction-lock";
import { reviewQuoteMap } from "../review-quotes";
import { shouldOfferTopUp } from "../wallet-funding";
import {
	executionMatchesReviewBasket,
	executionPlanHashMatchesReviewBasket,
	reviewBasketKey,
} from "../review-safety";
import { AssetMark } from "./AssetMark";
import { ArrowRight, Check, Close, Shield } from "./Icons";
import { ReviewPageSkeleton } from "./PageSkeletons";

const MIN_SIGNING_WINDOW_MS = 10_000;

export function ReviewScreen({
	session,
	selections,
	onRemove,
	onBack,
	onSettled,
	onExecutionChange,
	onExecutionInvalidated,
	onSessionExpired,
	onStartAnotherBasket,
	onTopUp,
	periodLimitUsd,
	wallet,
	liveExecution,
	liveBroadcastEnabled,
	activeChain,
	solanaWallet,
}: {
	session: WeeklySession;
	feed: FeedResponse;
	selections: Array<{
		candidate: Candidate;
		amountInBaseUnits: string;
	}>;
	onRemove: (assetId: string) => void;
	onBack: () => void;
	onSettled: (record: ExecutionRecord) => void;
	onExecutionChange: (record: ExecutionRecord) => void;
	onExecutionInvalidated: () => void;
	onSessionExpired: () => Promise<{ sessionId: string; assetIds: string[] }>;
	onStartAnotherBasket: () => void;
	onTopUp: () => void;
	periodLimitUsd: number;
	wallet: string;
	liveExecution: boolean;
	liveBroadcastEnabled: boolean;
	activeChain: "SOLANA";
	solanaWallet?: ConnectedStandardSolanaWallet;
}) {
	const { signTransaction } = useSignTransaction();
	const [record, setRecord] = useState<ExecutionRecord>();
	const [preparedBasketKey, setPreparedBasketKey] = useState("");
	const [loading, setLoading] = useState(true);
	const [phase, setPhase] = useState<ReviewExecutionPhase>("refreshing");
	const [confirmationOpen, setConfirmationOpen] = useState(false);
	const [error, setError] = useState("");
	const [errorCode, setErrorCode] = useState("");
	const [unavailableAssetIds, setUnavailableAssetIds] = useState<string[]>([]);
	const [executionConflict, setExecutionConflict] = useState(false);
	const [now, setNow] = useState(() => Date.now());
	const [walletBalance, setWalletBalance] = useState<number>();
	const autoPrepareStarted = useRef(false);
	const preparationAttempt = useRef(0);
	const selected = selections.map(({ candidate }) => candidate);
	const amountByAssetId = new Map(
		selections.map(({ candidate, amountInBaseUnits }) => [
			candidate.assetId,
			amountInBaseUnits,
		]),
	);
	const total = Number(
		formatUnits(
			selections.reduce(
				(sum, selection) => sum + BigInt(selection.amountInBaseUnits),
				0n,
			),
			6,
		),
	);
	const stableToken = "USDC";
	const checkoutUi = liveCheckoutUi({
		liveExecution,
		liveBroadcastEnabled,
	});
	const basket = useMemo(
		() => ({
			sessionId: session.id,
			epochId: session.epochId,
			chain: "SOLANA" as const,
			executionProvider: "JUPITER" as const,
			selections,
			periodLimitUsd,
			wallet,
		}),
		[selections, session.epochId, session.id, periodLimitUsd, wallet],
	);
	const basketKey = reviewBasketKey(basket);
	const currentBasketKey = useRef(basketKey);
	currentBasketKey.current = basketKey;
	const activeRecord =
		preparedBasketKey === basketKey &&
		executionMatchesReviewBasket(record, basket)
			? record
			: undefined;
	const atomicSolanaTransaction =
		activeRecord?.solanaTransaction ?? activeRecord?.plan.solanaTransaction;
	const solanaTransactions =
		activeRecord?.solanaTransactions ??
		activeRecord?.plan.solanaTransactions ??
		(atomicSolanaTransaction ? [atomicSolanaTransaction] : []);
	const perLegSolana = Boolean(activeRecord?.plan.solanaTransactions);
	const signingBlocked =
		checkoutUi.disabled &&
		activeRecord?.status === "PREPARED" &&
		solanaTransactions.length > 0;
	const interactionsLocked = reviewInteractionsLocked({
		phase,
		hasPreparedExecution: Boolean(activeRecord),
	});
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 1_000);
		return () => window.clearInterval(timer);
	}, []);
	useEffect(() => {
		if (!wallet) {
			setWalletBalance(undefined);
			return;
		}
		let cancelled = false;
		setWalletBalance(undefined);
		const request = api
			.solanaBalance(wallet)
			.then(({ usdcBalanceBaseUnits, usdcDecimals }) =>
				Number(formatUnits(BigInt(usdcBalanceBaseUnits), usdcDecimals)),
			);
		void request
			.then((balance) => {
				if (!cancelled) setWalletBalance(balance);
			})
			.catch(() => {
				if (!cancelled) setWalletBalance(undefined);
			});
		return () => {
			cancelled = true;
		};
	}, [wallet]);
	const quoteExpiry = useMemo(() => {
		const quotes =
			activeRecord?.plan.quotes ?? selected.flatMap((item) => item.quote ?? []);
		if (!quotes.length) return 0;
		return Math.max(
			0,
			Math.min(...quotes.map((quote) => new Date(quote.expiresAt).getTime())) -
				now,
		);
	}, [activeRecord, now, selected]);
	const quotesFresh = quoteExpiry > 0;
	const quotesSafeToSign = quoteExpiry > MIN_SIGNING_WINDOW_MS;
	const hasExecutableTransaction = Boolean(solanaTransactions.length);
	const executionWalletReady = Boolean(
		solanaWallet && solanaWallet.address === wallet,
	);
	const quoteByAssetId = reviewQuoteMap(
		activeRecord?.plan.quotes,
		selections.map(({ candidate, amountInBaseUnits }) => ({
			amountInBaseUnits,
			quote: candidate.quote,
		})),
	);

	const prepare = useCallback(async () => {
		if (!selected.length) {
			setError("Choose at least one asset before refreshing quotes.");
			return;
		}
		const attempt = ++preparationAttempt.current;
		const requestedBasketKey = basketKey;
		setLoading(true);
		setPhase("refreshing");
		setError("");
		setErrorCode("");
		setUnavailableAssetIds([]);
		setExecutionConflict(false);
		try {
			const prepared = await api.prepareExecution(
				session.id,
				selections.map(({ candidate, amountInBaseUnits }) => ({
					assetId: candidate.assetId,
					amountInBaseUnits,
				})),
				periodLimitUsd,
				activeChain,
			);
			if (
				attempt !== preparationAttempt.current ||
				requestedBasketKey !== currentBasketKey.current
			)
				return;
			setRecord(prepared);
			setPreparedBasketKey(requestedBasketKey);
			onExecutionChange(prepared);
		} catch (caught) {
			if (attempt !== preparationAttempt.current) return;
			const code = caught instanceof ApiError ? caught.code : "";
			const message = preparationErrorMessage(caught);
			const unavailableIds =
				caught instanceof ApiError &&
				code === "EXECUTION_ASSETS_UNAVAILABLE" &&
				Array.isArray(caught.details.assetIds)
					? caught.details.assetIds.filter(
							(assetId): assetId is string =>
								typeof assetId === "string" &&
								selected.some((candidate) => candidate.assetId === assetId),
						)
					: [];
			setErrorCode(code);
			setUnavailableAssetIds(unavailableIds);
			if (
				code === "EXECUTION_ASSETS_UNAVAILABLE" &&
				caught instanceof ApiError
			) {
				if (
					unavailableIds.length > 0 &&
					unavailableIds.length < selected.length
				) {
					autoPrepareStarted.current = false;
					setError(
						`${message} Removed the unavailable asset and refreshing the remaining basket.`,
					);
					setErrorCode("");
					for (const assetId of unavailableIds) onRemove(assetId);
					return;
				}
			}
			if (code === "SESSION_NOT_FOUND") {
				try {
					const recovered = await onSessionExpired();
					const recoveredSelections = selections.filter(({ candidate }) =>
						recovered.assetIds.includes(candidate.assetId),
					);
					const prepared = await api.prepareExecution(
						recovered.sessionId,
						recoveredSelections.map(({ candidate, amountInBaseUnits }) => ({
							assetId: candidate.assetId,
							amountInBaseUnits,
						})),
						periodLimitUsd,
						activeChain,
					);
					if (attempt !== preparationAttempt.current) return;
					setRecord(prepared);
					setPreparedBasketKey(
						reviewBasketKey({
							...basket,
							sessionId: recovered.sessionId,
							epochId: prepared.plan.epochId,
							selections: recoveredSelections,
						}),
					);
					onExecutionChange(prepared);
					setError("");
					setErrorCode("");
				} catch (recoveryError) {
					setError(
						recoveryError instanceof Error
							? recoveryError.message
							: "Could not renew local session",
					);
				}
			} else if (
				caught instanceof ApiError &&
				(code === "EXECUTION_TERMINAL" || code === "EPOCH_ALREADY_EXECUTED")
			) {
				const executionId =
					typeof caught.details.executionId === "string"
						? caught.details.executionId
						: "";
				if (executionId) {
					try {
						const existing = await api.execution(executionId);
						if (existing.status !== "PREPARED") {
							onExecutionChange(existing);
							onSettled(existing);
							return;
						}
					} catch {
						// The product recovery below is still actionable if rehydration fails.
					}
				}
				setRecord(undefined);
				setPreparedBasketKey("");
				setExecutionConflict(true);
				setError(message);
			} else {
				setError(message);
			}
		} finally {
			setLoading(false);
			setPhase("idle");
		}
	}, [
		basket,
		basketKey,
		onExecutionChange,
		onSessionExpired,
		onSettled,
		onRemove,
		selected,
		session.id,
		selections,
		periodLimitUsd,
		activeChain,
	]);

	useEffect(() => {
		if (
			!record ||
			(preparedBasketKey === basketKey &&
				executionMatchesReviewBasket(record, basket))
		)
			return;
		preparationAttempt.current += 1;
		setRecord(undefined);
		setPreparedBasketKey("");
		setError("");
		setErrorCode("");
		setUnavailableAssetIds([]);
		setExecutionConflict(false);
		onExecutionInvalidated();
	}, [basketKey, basket, onExecutionInvalidated, preparedBasketKey, record]);

	useEffect(() => {
		if (activeRecord || autoPrepareStarted.current || !selected.length) return;
		autoPrepareStarted.current = true;
		void prepare();
	}, [activeRecord, prepare, selected]);

	async function settleDemo() {
		if (!activeRecord) return;
		setLoading(true);
		try {
			const settled = await api.demoSettle(activeRecord.plan.executionId);
			setRecord(settled);
			onExecutionChange(settled);
			onSettled(settled);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Settlement failed");
		} finally {
			setLoading(false);
		}
	}

	function removeAsset(assetId: string) {
		if (interactionsLocked) return;
		preparationAttempt.current += 1;
		setRecord(undefined);
		setPreparedBasketKey("");
		setError("");
		setErrorCode("");
		setUnavailableAssetIds([]);
		setExecutionConflict(false);
		onExecutionInvalidated();
		onRemove(assetId);
	}

	function editPreparedBasket() {
		if (loading || activeRecord?.status !== "PREPARED") return;
		preparationAttempt.current += 1;
		setConfirmationOpen(false);
		setRecord(undefined);
		setPreparedBasketKey("");
		setError("");
		setErrorCode("");
		setUnavailableAssetIds([]);
		onExecutionInvalidated();
		onBack();
	}

	async function confirmLive() {
		setConfirmationOpen(false);
		if (signingBlocked) {
			setError(checkoutUi.warning);
			return;
		}
		const signingBasketKey = basketKey;
		if (
			activeRecord?.status !== "PREPARED" ||
			!solanaTransactions.length ||
			!wallet ||
			!selected.length
		) {
			setError("No Investmade Wallet or executable calls are available.");
			return;
		}
		if (
			!quotesSafeToSign ||
			!(await executionPlanHashMatchesReviewBasket(activeRecord, basket)) ||
			signingBasketKey !== currentBasketKey.current
		) {
			setRecord(undefined);
			setPreparedBasketKey("");
			onExecutionInvalidated();
			setError(
				"The basket changed after preparation. Refresh quotes before signing.",
			);
			return;
		}
		if (!solanaWallet || solanaWallet.address !== wallet) {
			setError("Select the prepared Solana signing wallet before continuing.");
			return;
		}
		setLoading(true);
		setError("");
		try {
			setPhase("signing");
			const signedTransactions: string[] = [];
			for (const [index, prepared] of solanaTransactions.entries()) {
				if (signingBasketKey !== currentBasketKey.current) {
					throw new Error("BASKET_CHANGED_DURING_SIGNING");
				}
				const { signedTransaction } = await signTransaction({
					transaction: base64ToBytes(prepared.unsignedTransactionBase64),
					wallet: solanaWallet,
					chain: "solana:mainnet",
					options: {
						uiOptions: {
							showWalletUIs: false,
							description: perLegSolana
								? `Sign swap ${index + 1} of ${solanaTransactions.length}. Swaps settle independently.`
								: `Invest ${formatTicketSizeUsd(total)} USDC through Jupiter. Every swap succeeds or none do.`,
							buttonText: perLegSolana
								? `Sign swap ${index + 1} of ${solanaTransactions.length}`
								: `Sign & invest ${formatTicketSizeUsd(total)} USDC`,
						},
					},
				});
				signedTransactions.push(bytesToBase64(signedTransaction));
			}
			if (
				signingBasketKey !== currentBasketKey.current ||
				!executionQuotesSafeToSubmit(activeRecord) ||
				!(await executionPlanHashMatchesReviewBasket(activeRecord, basket))
			) {
				throw new Error("BASKET_OR_QUOTES_CHANGED_BEFORE_SUBMIT");
			}
			const submitted = await api.submitSolana(
				activeRecord.plan.executionId,
				signedTransactions,
			);
			setRecord(submitted);
			onExecutionChange(submitted);
			onSettled(submitted);
		} catch (caught) {
			if (
				caught instanceof Error &&
				[
					"BASKET_CHANGED_DURING_SIGNING",
					"BASKET_OR_QUOTES_CHANGED_BEFORE_SUBMIT",
				].includes(caught.message)
			) {
				setError(
					"The quote expired before broadcast. Building a fresh transaction plan.",
				);
				autoPrepareStarted.current = false;
				await prepare();
			} else {
				setError(executionErrorMessage(caught));
			}
		} finally {
			setLoading(false);
			setPhase("idle");
		}
		return;
	}

	async function resumeReconciliation() {
		if (!record) return;
		setLoading(true);
		setError("");
		try {
			const reconciled = await reconcileUntilTerminal(record.plan.executionId);
			setRecord(reconciled);
			onExecutionChange(reconciled);
			onSettled(reconciled);
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "Could not verify settlement yet.",
			);
		} finally {
			setLoading(false);
		}
	}

	if (loading && phase === "refreshing") {
		return <ReviewPageSkeleton />;
	}

	return (
		<>
			{confirmationOpen && activeRecord?.status === "PREPARED" ? (
				<div className="checkout-confirmation-overlay" role="presentation">
					<section
						className="checkout-confirmation"
						role="dialog"
						aria-modal="true"
						aria-labelledby="checkout-confirmation-title"
					>
						<span className="onboarding-kicker">Mainnet · Real funds</span>
						<h2 id="checkout-confirmation-title">Confirm your basket</h2>
						<p>
							You are investing {formatTicketSizeUsd(total)} USDC across{" "}
							{selected.length} assets in {solanaTransactions.length}{" "}
							{solanaTransactions.length === 1 ? "transaction" : "transactions"}
							.
						</p>
						<div className="checkout-confirmation-groups">
							{solanaTransactions.map((transaction, index) => (
								<div key={transaction.messageCommitment}>
									<strong>Transaction {index + 1}</strong>
									<span>
										{transaction.expectedBalanceChanges
											.map(
												(change) =>
													selected.find(
														(item) => item.assetId === change.assetId,
													)?.symbol,
											)
											.filter(Boolean)
											.join(", ")}
									</span>
								</div>
							))}
						</div>
						<p>
							Estimated network fee: approximately{" "}
							{formatSolFee(solanaTransactions.length)} SOL. Final fee may vary
							slightly. Quotes expire in{" "}
							{Math.max(0, Math.ceil(quoteExpiry / 1_000))}s.
						</p>
						<div className="checkout-confirmation-actions">
							<button
								type="button"
								className="button button-outline"
								onClick={editPreparedBasket}
							>
								Edit basket
							</button>
							<button
								type="button"
								className="button button-quiet"
								onClick={() => setConfirmationOpen(false)}
							>
								Cancel
							</button>
							<button
								type="button"
								className="button button-primary"
								onClick={() => void confirmLive()}
								disabled={!quotesSafeToSign}
							>
								Confirm &amp; sign
							</button>
						</div>
					</section>
				</div>
			) : null}
			<main className="review-page">
				<section className="review-ledger">
					<header>
						<h1>Review your basket</h1>
						<p>
							{hasExecutableTransaction
								? `Fresh Jupiter quotes are ready for your wallet to confirm.${perLegSolana ? " Swaps settle independently, so partial completion is possible." : ""}`
								: liveExecution
									? "No transaction is prepared yet. Resolve the issue below, then refresh the quotes."
									: "Demo quotes are ready for a simulated confirmation."}
						</p>
						{error ? (
							<div className="review-error-actions">
								<p className="review-error" role="alert">
									{error}
								</p>
								{shouldOfferTopUp(errorCode) ? (
									<button
										type="button"
										className="button button-outline"
										onClick={onTopUp}
									>
										Top up wallet
									</button>
								) : null}
							</div>
						) : null}
					</header>
					<div className="ledger-table">
						<div className="ledger-row ledger-labels">
							<span>Asset</span>
							<span>Input (you pay)</span>
							<span>Estimated output</span>
							<span>Minimum output</span>
							<span>Impact</span>
						</div>
						{selected.map((candidate) => {
							const quote = quoteByAssetId.get(candidate.assetId);
							const unavailable = unavailableAssetIds.includes(
								candidate.assetId,
							);
							return (
								<div className="ledger-row" key={candidate.assetId}>
									<span className="ledger-asset">
										<AssetMark
											assetId={candidate.assetId}
											symbol={candidate.symbol}
											iconUrl={candidate.iconUrl}
											size="sm"
											decorative
										/>
										<b>
											{candidate.symbol}
											<small>{assetDisplayName(candidate.name)}</small>
										</b>
									</span>
									<span className="ledger-value ledger-value-pay">
										<small className="ledger-mobile-label">You pay</small>
										<span className="ledger-value-amount">
											<strong>
												{formatTicketSizeUsd(
													Number(
														formatUnits(
															BigInt(
																amountByAssetId.get(candidate.assetId) ?? "0",
															),
															6,
														),
													),
												)}
											</strong>{" "}
											{stableToken}
										</span>
									</span>
									<span className="ledger-value ledger-value-receive">
										<small className="ledger-mobile-label">You receive</small>
										<span
											className={`ledger-value-amount${unavailable ? " is-unavailable" : ""}`}
										>
											{unavailable ? (
												<strong>No route</strong>
											) : (
												<>
													<strong>
														{quote
															? formatOutput(
																	quote.estimatedAmountOut,
																	candidate.decimals,
																)
															: "—"}
													</strong>{" "}
													{candidate.symbol}
												</>
											)}
										</span>
									</span>
									<span>
										<strong>
											{quote
												? formatOutput(
														quote.minimumAmountOut,
														candidate.decimals,
													)
												: "—"}
										</strong>{" "}
										{candidate.symbol}
									</span>
									<span className="blue-text">
										{quote
											? `${(quote.priceImpactBps / 100).toFixed(2)}%`
											: "—"}
									</span>
									<button
										type="button"
										className="ledger-remove"
										onClick={() => removeAsset(candidate.assetId)}
										disabled={interactionsLocked}
										aria-label={`Remove ${candidate.symbol}`}
									>
										<Close />
									</button>
								</div>
							);
						})}
					</div>
					<div className="ledger-totals">
						<div>
							<span>Wallet balance</span>
							<strong>
								{walletBalance === undefined
									? "—"
									: formatTicketSizeUsd(walletBalance)}
							</strong>
							<small>
								<b>{stableToken}</b>
							</small>
						</div>
						<div>
							<span>Total input</span>
							<strong>{formatTicketSizeUsd(total)}</strong>
							<small>
								<b>{stableToken}</b> to invest
							</small>
						</div>
						<div>
							<span>Remainder</span>
							<strong>
								{formatTicketSizeUsd(
									Math.round((periodLimitUsd - total) * 100) / 100,
								)}
							</strong>
							<small>
								<b>{stableToken}</b>
							</small>
						</div>
					</div>
				</section>

				<aside className="policy-rail">
					<h2>Policy checks</h2>
					<div
						className={`live-execution-notice${checkoutUi.disabled ? " is-disabled" : ""}`}
						role="status"
					>
						<strong>{checkoutUi.label}</strong>
						<span>{checkoutUi.warning}</span>
					</div>
					{[
						{
							label: "Assets eligible",
							value: selected.length
								? `${selected.length} / ${selected.length}`
								: "No assets selected",
							ok: selected.length > 0,
						},
						{
							label: quotesSafeToSign
								? "Quotes fresh"
								: quotesFresh
									? "Quote nearly expired"
									: "Preview expired",
							value: quotesSafeToSign
								? `${Math.ceil(quoteExpiry / 1000)}s`
								: "Refresh required",
							ok: quotesSafeToSign,
						},
						{
							label: "Budget within limit",
							value: `${formatTicketSizeUsd(total)} / ${formatTicketSizeUsd(periodLimitUsd)} ${stableToken}`,
							ok: selected.length > 0,
						},
						{
							label: "Execution provider",
							value: "Jupiter",
							ok: true,
						},
						{
							label: "Solana · Mainnet",
							value: "Connected",
							ok: true,
						},
						{
							label: hasExecutableTransaction
								? perLegSolana
									? "Independent Solana swaps"
									: "Atomic Solana transaction"
								: liveExecution
									? "Live execution"
									: "Demo execution",
							value: hasExecutableTransaction
								? executionWalletReady
									? "Ready"
									: "Activation required"
								: liveExecution
									? "Quotes required"
									: "Simulated",
							ok: hasExecutableTransaction
								? executionWalletReady
								: !liveExecution,
						},
					].map(({ label, value, ok }) => (
						<div className="policy-row" key={label}>
							<span
								className={ok ? "check-circle" : "check-circle warning-circle"}
							>
								{ok ? <Check /> : "!"}
							</span>
							<b>{label}</b>
							<em>{value}</em>
						</div>
					))}
					{!liveExecution ? (
						<div className="wallet-boundary">
							<Shield />
							<p>
								<b>Demo only · no broadcast.</b>
								<br />
								This simulates basket confirmation and settlement without moving
								funds.
							</p>
						</div>
					) : null}
					{executionConflict ? (
						<button
							type="button"
							className="button button-outline"
							onClick={onStartAnotherBasket}
						>
							Start another basket
						</button>
					) : null}
					<div className="review-actions">
						<button
							type="button"
							className="button button-outline"
							onClick={activeRecord ? editPreparedBasket : onBack}
							disabled={
								loading ||
								Boolean(activeRecord && activeRecord.status !== "PREPARED")
							}
						>
							{activeRecord ? "Edit basket" : "Back to cards"}
						</button>
						{!activeRecord ? (
							<button
								type="button"
								className="button button-primary"
								onClick={prepare}
								disabled={loading || !selected.length}
							>
								{loading ? "Refreshing…" : "Refresh quotes"}{" "}
								{loading ? (
									<LoaderCircle className="button-spinner" />
								) : (
									<RotateCcw />
								)}
							</button>
						) : (
							<button
								type="button"
								className="button button-primary"
								onClick={
									activeRecord.status === "SUBMITTED"
										? resumeReconciliation
										: !quotesSafeToSign
											? prepare
											: hasExecutableTransaction
												? () => setConfirmationOpen(true)
												: settleDemo
								}
								disabled={
									loading ||
									!selected.length ||
									activeRecord.status === "SETTLED" ||
									signingBlocked
								}
							>
								{activeRecord.status === "SETTLED"
									? "Settled"
									: loading
										? phaseLabel(phase)
										: activeRecord.status === "SUBMITTED"
											? "Check settlement receipt"
											: signingBlocked
												? "Live purchases temporarily unavailable"
												: !quotesSafeToSign
													? "Refresh quotes"
													: hasExecutableTransaction
														? `Sign & invest ${formatTicketSizeUsd(total)} ${stableToken}`
														: "Simulate wallet confirmation"}{" "}
								{loading ? (
									<LoaderCircle className="button-spinner" />
								) : activeRecord.status !== "SETTLED" &&
									activeRecord.status !== "SUBMITTED" &&
									!quotesSafeToSign ? (
									<RotateCcw />
								) : (
									<ArrowRight />
								)}
							</button>
						)}
					</div>
				</aside>
			</main>
		</>
	);
}

function formatSolFee(transactionCount: number) {
	return (transactionCount * 0.000005).toFixed(6);
}

function executionQuotesSafeToSubmit(record: ExecutionRecord) {
	const expiresAt = Math.min(
		...record.plan.quotes.map((quote) => new Date(quote.expiresAt).getTime()),
	);
	return (
		Number.isFinite(expiresAt) && expiresAt - Date.now() > MIN_SIGNING_WINDOW_MS
	);
}

function executionErrorMessage(caught: unknown) {
	return caught instanceof Error ? caught.message : "Wallet execution failed.";
}

function preparationErrorMessage(caught: unknown) {
	const message =
		caught instanceof Error ? caught.message : "Could not prepare execution";
	if (
		/^sol:mainnet:[A-Za-z0-9]+ is not currently executable\.?$/i.test(message)
	) {
		return "One or more selected assets do not have a fresh Jupiter route. Remove the unavailable asset or return to the feed and choose another token.";
	}
	return message;
}

function formatOutput(raw: string, decimals: number) {
	const value = Number(formatUnits(BigInt(raw), decimals));
	return Number.isFinite(value)
		? value.toLocaleString(undefined, { maximumSignificantDigits: 6 })
		: "—";
}

function base64ToBytes(value: string) {
	const binary = window.atob(value);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64(value: Uint8Array) {
	let binary = "";
	for (const byte of value) binary += String.fromCharCode(byte);
	return window.btoa(binary);
}

async function reconcileUntilTerminal(
	executionId: string,
): Promise<ExecutionRecord> {
	for (let attempt = 0; attempt < 40; attempt += 1) {
		const record = await api.reconcile(executionId);
		if (["SETTLED", "PARTIAL", "FAILED"].includes(record.status)) return record;
		await new Promise((resolve) =>
			setTimeout(resolve, attempt < 12 ? 500 : 1_500),
		);
	}
	throw new Error(
		"Transactions are submitted but not terminal yet. Check Receipts shortly.",
	);
}

function phaseLabel(
	phase: "idle" | "refreshing" | "simulating" | "signing" | "settling",
) {
	if (phase === "refreshing") return "Refreshing quotes…";
	if (phase === "simulating") return "Simulating full basket…";
	if (phase === "signing") return "Basket settlement";
	if (phase === "settling") return "Verifying settlement…";
	return "Working…";
}
