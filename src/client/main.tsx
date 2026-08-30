import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { Analytics } from "@vercel/analytics/react";
import { StrictMode, useEffect, useLayoutEffect, useState } from "react";
import { preload } from "react-dom";
import { createRoot } from "react-dom/client";
import "@fontsource/archivo-black/400.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/dm-sans/800.css";
import "@fontsource/dm-sans/900.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource/instrument-serif/400.css";
import instrumentSerifRegularUrl from "@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2?url";
import { App } from "./App";
import { api, type PublicConfig } from "./api";
import { AppBootstrapSkeleton } from "./components/PageSkeletons";
import { captureException, SentryErrorBoundary } from "./observability";
import {
	applyDocumentTheme,
	readThemeSettings,
	type ThemeSettings,
	writeThemeSettings,
} from "./theme-settings";
import "./styles.css";

preload(instrumentSerifRegularUrl, {
	as: "font",
	crossOrigin: "anonymous",
	type: "font/woff2",
});

const initialThemeSettings = readThemeSettings();
applyDocumentTheme(initialThemeSettings.SOLANA);

function Root() {
	const [config, setConfig] = useState<PublicConfig>();
	const [error, setError] = useState("");
	const [themeSettings, setThemeSettings] = useState(initialThemeSettings);
	useLayoutEffect(() => {
		applyDocumentTheme(themeSettings.SOLANA);
	}, [themeSettings.SOLANA]);

	function saveThemeSettings(settings: ThemeSettings) {
		writeThemeSettings(settings);
		setThemeSettings(settings);
	}

	useEffect(() => {
		api
			.config()
			.then(setConfig)
			.catch((caught) => {
				captureException(caught);
				setError(
					caught instanceof Error
						? caught.message
						: "Could not load app configuration",
				);
			});
	}, []);

	if (error) {
		return (
			<main className="fatal-state">
				<h1>invest4.fun is unavailable</h1>
				<p>{error}</p>
			</main>
		);
	}
	if (!config) {
		return <AppBootstrapSkeleton />;
	}

	return (
		<PrivyProvider
			appId={config.privy.appId}
			config={{
				loginMethods: ["email", "wallet"],
				appearance: {
					theme: themeSettings.SOLANA,
					accentColor: "#baff00",
					walletChainType: "solana-only",
					walletList: [
						"phantom",
						"solflare",
						"backpack",
						"jupiter",
						"detected_solana_wallets",
						"wallet_connect_qr_solana",
					],
				},
				externalWallets: {
					solana: {
						connectors: toSolanaWalletConnectors({ shouldAutoConnect: false }),
					},
				},
				embeddedWallets: {
					solana: { createOnLogin: "all-users" },
				},
				solana: {
					rpcs: {
						"solana:mainnet": {
							rpc: createSolanaRpc(`${window.location.origin}/api/solana/rpc`),
							rpcSubscriptions: createSolanaRpcSubscriptions(
								"wss://api.mainnet-beta.solana.com",
							),
							blockExplorerUrl: "https://explorer.solana.com",
						},
					},
				},
			}}
		>
			<App
				config={config}
				themeSettings={themeSettings}
				onThemeSettingsChange={saveThemeSettings}
			/>
		</PrivyProvider>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element is missing");

createRoot(root).render(
	<StrictMode>
		<SentryErrorBoundary
			fallback={
				<main className="fatal-state">
					<h1>invest4.fun is unavailable</h1>
					<p>
						The application encountered an unexpected error. Please refresh
						and try again.
					</p>
				</main>
			}
		>
			<Root />
			<Analytics />
		</SentryErrorBoundary>
	</StrictMode>,
);
