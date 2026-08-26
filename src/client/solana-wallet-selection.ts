type SolanaWallet = { address: string };

type LinkedAccount = {
	type: string;
	address?: string;
	chainType?: string;
	walletClientType?: string;
};

export function findEmbeddedSolanaWallet<T extends SolanaWallet>(
	wallets: readonly T[],
	linkedAccounts: readonly LinkedAccount[] = [],
) {
	const embeddedAddress = linkedAccounts.find(
		(account) =>
			account.type === "wallet" &&
			account.chainType === "solana" &&
			(account.walletClientType === "privy" ||
				account.walletClientType === "privy-v2"),
	)?.address;

	return wallets.find((wallet) => wallet.address === embeddedAddress);
}

export function findExternalSolanaWallet<T extends SolanaWallet>(
	wallets: readonly T[],
	embeddedWallet?: SolanaWallet,
) {
	return wallets.find((wallet) => wallet.address !== embeddedWallet?.address);
}
