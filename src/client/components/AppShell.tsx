import type { ConnectedStandardSolanaWallet } from "@privy-io/react-auth/solana";
import {
	BriefcaseBusiness,
	CircleUserRound,
	GalleryVerticalEnd,
	Wallet,
} from "lucide-react";
import {
	type CSSProperties,
	type MouseEvent,
	type ReactNode,
	useState,
} from "react";
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
		<nav
			className={className}
			aria-label="Primary navigation"
			style={
				{
					"--primary-nav-count": PRIMARY_NAV_ITEMS.length,
				} as CSSProperties
			}
		>
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
	solanaWallets,
	selectedSolanaWallet,
	onSolanaWalletChange,
	children,
}: Props) {
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
						{walletReady ? "Sign in" : "Loading…"}
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
