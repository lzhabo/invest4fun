export type PrimaryView =
	| "week"
	| "builder"
	| "ideas"
	| "market"
	| "positions"
	| "settings";

const VIEW_PATHS: Record<PrimaryView, string> = {
	week: "/feed",
	builder: "/builder",
	ideas: "/ideas",
	market: "/market",
	positions: "/portfolio",
	settings: "/settings",
};

const PUBLIC_PRIMARY_VIEWS = new Set<PrimaryView>([
	"week",
	"builder",
	"ideas",
	"market",
]);

export function isPublicPrimaryView(view: PrimaryView) {
	return PUBLIC_PRIMARY_VIEWS.has(view);
}

export function shouldShowPublicFeedPreview(
	view: PrimaryView,
	authenticated: boolean,
) {
	return view === "week" && !authenticated;
}

export function pathForPrimaryView(view: PrimaryView) {
	return VIEW_PATHS[view];
}

export function primaryViewFromPathname(
	pathname: string,
): PrimaryView | undefined {
	const normalized = pathname === "/" ? "/feed" : pathname.replace(/\/+$/, "");
	if (normalized === "/account") return "settings";
	return (Object.entries(VIEW_PATHS) as Array<[PrimaryView, string]>).find(
		([, path]) => path === normalized,
	)?.[0];
}
