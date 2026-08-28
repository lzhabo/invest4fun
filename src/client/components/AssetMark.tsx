import {
	createContext,
	type CSSProperties,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from "react";
import { api } from "../api";

const CURATED_ICON_URLS: Record<string, string> = {
	"sol:mainnet:SOL": "/assets/chains/solana.svg",
	"sol:mainnet:cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij":
		"/assets/tokens/cbbtc.svg",
};
const AssetIconsContext = createContext<Record<string, string>>({});

export function AssetIconProvider({ children }: { children: ReactNode }) {
	const [icons, setIcons] = useState<Record<string, string>>({});

	useEffect(() => {
		let mounted = true;
		api
			.assetIcons()
			.then(({ icons: next }) => {
				if (!mounted) return;
				setIcons(
					Object.fromEntries(
						Object.entries(next).map(([key, value]) => [
							key.toUpperCase(),
							value,
						]),
					),
				);
			})
			.catch(() => undefined);
		return () => {
			mounted = false;
		};
	}, []);

	return (
		<AssetIconsContext.Provider value={icons}>
			{children}
		</AssetIconsContext.Provider>
	);
}

export function assetLogoSources({
	assetId,
	iconUrl,
	iconUrls = [],
	registeredIconUrl,
}: {
	assetId?: string;
	symbol: string;
	iconUrl?: string;
	iconUrls?: string[];
	registeredIconUrl?: string;
}): string[] {
	return [
		assetId ? CURATED_ICON_URLS[assetId] : undefined,
		...expandIconSource(iconUrl),
		...iconUrls.flatMap((source) => expandIconSource(source)),
		...expandIconSource(registeredIconUrl),
	].filter(
		(source, index, sources): source is string =>
			Boolean(source) && sources.indexOf(source) === index,
	);
}

function fallbackHue(assetId: string) {
	let hash = 0;
	for (const character of assetId) {
		hash = (hash * 31 + character.charCodeAt(0)) % 360;
	}
	return hash;
}

function AssetLogo({
	assetId,
	sources,
	symbol,
	decorative,
}: {
	assetId: string;
	sources: string[];
	symbol: string;
	decorative: boolean;
}) {
	const [sourceIndex, setSourceIndex] = useState(0);

	const imageUrl = sources[sourceIndex];
	useEffect(() => {
		if (!imageUrl) return;
		const timer = window.setTimeout(
			() => setSourceIndex((index) => index + 1),
			3_000,
		);
		return () => window.clearTimeout(timer);
	}, [imageUrl]);
	if (!imageUrl) {
		const fallback = symbol.match(/[a-z0-9]/i)?.[0]?.toUpperCase() ?? "•";
		const style = {
			backgroundColor: `hsl(${fallbackHue(assetId)} 55% 88%)`,
		} as CSSProperties;
		return decorative ? (
			<span aria-hidden="true" data-asset-fallback={assetId} style={style}>
				{fallback}
			</span>
		) : (
			<span
				role="img"
				aria-label={`${symbol} logo`}
				data-asset-fallback={assetId}
				style={style}
			>
				{fallback}
			</span>
		);
	}

	return (
		<img
			src={imageUrl}
			alt={decorative ? "" : `${symbol} logo`}
			onError={() => setSourceIndex((index) => index + 1)}
		/>
	);
}

function expandIconSource(source?: string) {
	if (!source) return [];
	const ipfsPath = source.startsWith("ipfs://")
		? source.slice("ipfs://".length)
		: source.match(/^https:\/\/ipfs\.io\/ipfs\/(.+)$/)?.[1];
	if (!ipfsPath) return [source];
	return [
		`https://ipfs.io/ipfs/${ipfsPath}`,
		`https://cloudflare-ipfs.com/ipfs/${ipfsPath}`,
		`https://gateway.pinata.cloud/ipfs/${ipfsPath}`,
	];
}

export function AssetMark({
	assetId,
	symbol,
	iconUrl,
	iconUrls,
	size = "md",
	decorative = false,
}: {
	assetId?: string;
	symbol: string;
	iconUrl?: string;
	iconUrls?: string[];
	size?: "sm" | "md" | "lg";
	decorative?: boolean;
}) {
	const registeredIconUrl = useContext(AssetIconsContext)[symbol.toUpperCase()];
	const identity = assetId ?? `symbol:${symbol.toUpperCase()}`;
	const sources = assetLogoSources({
		assetId,
		symbol,
		iconUrl,
		iconUrls,
		registeredIconUrl,
	});

	return (
		<span
			className={`asset-mark asset-${symbol.toLowerCase()} asset-mark-${size}`}
			aria-hidden={decorative || undefined}
		>
			<AssetLogo
				key={`${identity}:${sources.join("|")}`}
				assetId={identity}
				sources={sources}
				symbol={symbol}
				decorative={decorative}
			/>
		</span>
	);
}
