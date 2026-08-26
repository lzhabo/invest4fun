export type PrimaryView = "week" | "positions" | "account";

const VIEW_PATHS: Record<PrimaryView, string> = {
	week: "/feed",
	positions: "/portfolio",
	account: "/account",
};

export function pathForPrimaryView(view: PrimaryView) {
	return VIEW_PATHS[view];
}

export function primaryViewFromPathname(pathname: string): PrimaryView | undefined {
	const normalized = pathname === "/" ? "/feed" : pathname.replace(/\/+$/, "");
	return (Object.entries(VIEW_PATHS) as Array<[PrimaryView, string]>).find(
		([, path]) => path === normalized,
	)?.[0];
}
