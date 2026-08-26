import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../api";

const LOGO_DEV_PUBLISHABLE_KEY = "pk_Vd4Z_uMzQJCMUA21nk_6Gw";
const AssetIconsContext = createContext<Record<string, string>>({});

export function AssetIconProvider({ children }: { children: ReactNode }) {
  const [icons, setIcons] = useState<Record<string, string>>({});

  useEffect(() => {
    let mounted = true;
    api.assetIcons().then(({ icons: next }) => {
      if (mounted) setIcons(next);
    }).catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  return <AssetIconsContext.Provider value={icons}>{children}</AssetIconsContext.Provider>;
}

function AssetLogo({
  iconUrl,
  symbol,
  decorative,
}: {
  iconUrl?: string;
  symbol: string;
  decorative: boolean;
}) {
  type LogoSource = "provided" | "logoDev" | "letter";
  const fallbackSource: LogoSource = symbol === "WETH" ? "letter" : "logoDev";
  const initialSource: LogoSource = iconUrl ? "provided" : fallbackSource;
  const [source, setSource] = useState<LogoSource>(initialSource);

  useEffect(() => setSource(iconUrl ? "provided" : fallbackSource), [iconUrl, fallbackSource]);

  const imageUrl = source === "provided"
    ? iconUrl
    : source === "logoDev"
    ? `https://img.logo.dev/ticker/${encodeURIComponent(symbol.toUpperCase())}?token=${LOGO_DEV_PUBLISHABLE_KEY}&size=128&format=png&theme=light&retina=true&fallback=404`
		: undefined;

  if (!imageUrl) {
    const fallback = symbol === "WETH" ? "◆" : symbol.slice(0, 1);
    return decorative ? (
      <span aria-hidden="true">{fallback}</span>
    ) : (
      <span role="img" aria-label={`${symbol} logo`}>
        {fallback}
      </span>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={decorative ? "" : `${symbol} logo`}
      onError={() => setSource(
        source === "provided" && symbol !== "WETH"
          ? "logoDev"
			: "letter"
      )}
    />
  );
}

export function AssetMark({
  symbol,
  iconUrl,
  size = "md",
  decorative = false,
}: {
  symbol: string;
  iconUrl?: string;
  size?: "sm" | "md" | "lg";
  decorative?: boolean;
}) {
	const registeredIconUrl = useContext(AssetIconsContext)[symbol];
  const resolvedIconUrl = iconUrl ?? registeredIconUrl;

  return (
    <span
      className={`asset-mark asset-${symbol.toLowerCase()} asset-mark-${size}`}
      aria-hidden={decorative || undefined}
    >
      <AssetLogo
		key={resolvedIconUrl ?? ""}
		iconUrl={resolvedIconUrl}
        symbol={symbol}
        decorative={decorative}
      />
    </span>
  );
}
