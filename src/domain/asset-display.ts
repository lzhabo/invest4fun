export function assetDisplayName(name: string): string {
	const cleaned = name
		.replace(/\(?\bxstocks?\b\)?/gi, "")
		.replace(/\s{2,}/g, " ")
		.trim();
	return cleaned || "Token";
}
