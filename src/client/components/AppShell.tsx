import type { ConnectedStandardSolanaWallet } from "@privy-io/react-auth/solana";
import {
	BriefcaseBusiness,
	CircleUserRound,
	GalleryVerticalEnd,
	Wallet,
} from "lucide-react";
import {
	type MouseEvent,
	type ReactNode,
	useLayoutEffect,
	useState,
} from "react";
import type { AppTheme } from "../theme-settings";
import { type PrimaryView, pathForPrimaryView } from "../view-routing";
import { WalletMenu } from "./WalletMenu";

const PRIMARY_NAV_ITEMS = [
	{ id: "week", label: "Feed", Icon: GalleryVerticalEnd },
	{ id: "positions", label: "Portfolio", Icon: BriefcaseBusiness },
	{ id: "account", label: "Account", Icon: CircleUserRound },
] satisfies Array<{
	id: PrimaryView;
	label: string;
	Icon: typeof GalleryVerticalEnd;
}>;

export function PrimaryNav({
	active,
	onNavigate,
	className,
}: {
	active: PrimaryView | "receipts";
	onNavigate?: (target: PrimaryView) => void;
	className?: string;
}) {
	const [symbolEffect, setSymbolEffect] = useState<{
		id: PrimaryView;
		iteration: number;
	} | null>(null);

	return (
		<nav className={className} aria-label="Primary navigation">
			{PRIMARY_NAV_ITEMS.map(({ id, label, Icon }) => {
				const isBouncing = symbolEffect?.id === id;

				return (
					<a
						key={id}
						href={pathForPrimaryView(id)}
						className={active === id ? "nav-link active" : "nav-link"}
						onClick={(event: MouseEvent<HTMLAnchorElement>) => {
							setSymbolEffect((current) => ({
								id,
								iteration: (current?.iteration ?? 0) + 1,
							}));
							if (
								onNavigate &&
								!event.metaKey &&
								!event.ctrlKey &&
								!event.shiftKey &&
								!event.altKey
							) {
								event.preventDefault();
								onNavigate(id);
							}
						}}
						aria-current={active === id ? "page" : undefined}
					>
						<Icon
							key={`${id}-${isBouncing ? (symbolEffect?.iteration ?? 0) : 0}`}
							className={isBouncing ? "nav-symbol-bounce" : undefined}
							aria-hidden="true"
						/>
						<span>{label}</span>
					</a>
				);
			})}
		</nav>
	);
}

interface Props {
	active: "week" | "positions" | "receipts" | "account";
	onNavigate: (target: Props["active"]) => void;
	wallet?: string;
	onWallet?: () => void;
	walletReady?: boolean;
	navigationEnabled?: boolean;
	activeChain: "SOLANA";
	theme: AppTheme;
	solanaWallets: ConnectedStandardSolanaWallet[];
	selectedSolanaWallet?: ConnectedStandardSolanaWallet;
	onSolanaWalletChange: (wallet: ConnectedStandardSolanaWallet) => void;
	children: ReactNode;
}

export function AppShell({
	active,
	onNavigate,
	wallet,
	onWallet,
	walletReady = true,
	navigationEnabled = true,
	activeChain,
	theme,
	solanaWallets,
	selectedSolanaWallet,
	onSolanaWalletChange,
	children,
}: Props) {
	useLayoutEffect(() => {
		const root = document.documentElement;
		const themeColor = document.querySelector<HTMLMetaElement>(
			'meta[name="theme-color"]',
		);
		const previousChain = root.dataset.chain;
		const previousTheme = root.dataset.theme;
		const previousThemeColor = themeColor?.content;
		const chain = activeChain.toLowerCase();

		root.dataset.chain = chain;
		root.dataset.theme = theme;
		if (themeColor) {
			themeColor.content = theme === "dark" ? "#090B0F" : "#f1f3f6";
		}

		return () => {
			if (previousChain) root.dataset.chain = previousChain;
			else delete root.dataset.chain;
			if (previousTheme) root.dataset.theme = previousTheme;
			else delete root.dataset.theme;
			if (themeColor && previousThemeColor)
				themeColor.content = previousThemeColor;
		};
	}, [activeChain, theme]);

	return (
		<div className="app-shell">
			<header
				className={navigationEnabled ? "topbar" : "topbar topbar-onboarding"}
			>
				<div className="brand-lockup">
					<button
						type="button"
						className="brand"
						onClick={() => onNavigate("week")}
						aria-label="invest4.fun home"
					>
						invest4.<span>fun</span>
					</button>
					{navigationEnabled ? null : <span className="beta-badge">Beta</span>}
				</div>
				{navigationEnabled ? (
					<PrimaryNav
						active={active}
						onNavigate={onNavigate}
						className="desktop-primary-nav"
					/>
				) : null}
				{wallet ? (
					<div className="wallet-pill">
						<WalletMenu
							wallet={wallet}
							solanaWallets={solanaWallets}
							selectedSolanaWallet={selectedSolanaWallet}
							onSolanaWalletChange={onSolanaWalletChange}
						/>
					</div>
				) : (
					<button
						type="button"
						className="wallet-button"
						onClick={onWallet}
						disabled={!walletReady}
						aria-label="Sign in with Privy"
						title="Sign in with Privy"
					>
						{navigationEnabled ? <Wallet size={17} strokeWidth={1.7} /> : null}
						{navigationEnabled ? "Connect wallet" : "Sign in"}
					</button>
				)}
			</header>
			{children}
			{navigationEnabled ? (
				<div className="mobile-primary-navigation">
					<PrimaryNav active={active} onNavigate={onNavigate} />
				</div>
			) : null}
		</div>
	);
}
