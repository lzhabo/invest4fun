import {
	type ConnectedStandardSolanaWallet,
	useSignAndSendTransaction,
} from "@privy-io/react-auth/solana";
import { toDataURL } from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";
import { SOLANA_USDC_MINT } from "../domain/solana";
import { api, type SolanaBalanceResponse } from "./api";
import {
	type FundingReceiptNotification,
	fundingReceiptNotifications,
} from "./funding-notifications";
import {
	buildSolFundingTransaction,
	buildUsdcFundingTransaction,
} from "./funding-transactions";
import {
	classifyWalletFunding,
	type WalletFundingState,
} from "./wallet-funding";

export function useWalletFunding({
	wallet,
	fundingWallet,
	ticketSizeUsd,
}: {
	wallet: string;
	fundingWallet?: ConnectedStandardSolanaWallet;
	ticketSizeUsd: number;
}) {
	const { signAndSendTransaction } = useSignAndSendTransaction();
	const [balance, setBalance] = useState<SolanaBalanceResponse>();
	const [state, setState] = useState<WalletFundingState>();
	const [loading, setLoading] = useState(Boolean(wallet));
	const [error, setError] = useState("");
	const [qrCode, setQrCode] = useState("");
	const [receipts, setReceipts] = useState<FundingReceiptNotification[]>([]);
	const lastWallet = useRef("");
	const previousBalance = useRef<SolanaBalanceResponse | undefined>(undefined);

	const refresh = useCallback(
		async (requiredTicketSizeUsd = ticketSizeUsd, signal?: AbortSignal) => {
			if (!wallet) return;
			setLoading(true);
			setError("");
			try {
				const nextBalance = await api.solanaBalance(wallet, signal);
				const nextState = classifyWalletFunding({
					...nextBalance,
					ticketSizeUsd: requiredTicketSizeUsd,
				});
				const received = fundingReceiptNotifications(
					previousBalance.current,
					nextBalance,
				);
				previousBalance.current = nextBalance;
				if (received.length) {
					setReceipts((current) => {
						const next = new Map(current.map((item) => [item.asset, item]));
						for (const receipt of received) next.set(receipt.asset, receipt);
						return [...next.values()];
					});
				}
				setBalance(nextBalance);
				setState(nextState);
				return { balance: nextBalance, state: nextState };
			} catch (caught) {
				setError(
					signal?.aborted
						? "Could not check wallet balance."
						: caught instanceof Error
							? caught.message
							: "Could not read wallet balances.",
				);
			} finally {
				setLoading(false);
			}
		},
		[ticketSizeUsd, wallet],
	);

	useEffect(() => {
		if (lastWallet.current !== wallet) {
			lastWallet.current = wallet;
			setBalance(undefined);
			previousBalance.current = undefined;
			setReceipts([]);
			setState(undefined);
			setError("");
		}
	}, [wallet]);

	useEffect(() => {
		if (!wallet) {
			setQrCode("");
			return;
		}
		let cancelled = false;
		void toDataURL(`solana:${wallet}`, { margin: 1, width: 184 }).then(
			(url) => {
				if (!cancelled) setQrCode(url);
			},
		);
		return () => {
			cancelled = true;
		};
	}, [wallet]);

	const send = useCallback(
		async (asset: "USDC" | "SOL", amount: number) => {
			if (!fundingWallet)
				throw new Error("Connect an external Solana wallet first.");
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
			await refresh();
		},
		[fundingWallet, refresh, signAndSendTransaction, wallet],
	);

	return {
		balance,
		state,
		loading,
		error,
		qrCode,
		usdcBalance: balance
			? formatUnits(BigInt(balance.usdcBalanceBaseUnits), balance.usdcDecimals)
			: "0",
		solBalance: balance
			? formatUnits(BigInt(balance.solBalanceLamports), 9)
			: "0",
		receipts,
		dismissReceipt: (asset: FundingReceiptNotification["asset"]) =>
			setReceipts((current) =>
				current.filter((receipt) => receipt.asset !== asset),
			),
		refresh,
		sendUsdc: (amount: number) => send("USDC", amount),
		sendSol: (amount: number) => send("SOL", amount),
	};
}

export async function copyWalletAddress(address: string) {
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
}
