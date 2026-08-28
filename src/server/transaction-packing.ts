export interface TransactionPackingCandidate {
	mask: number;
	serializedSize: number;
}

export function minimumTransactionPacking(
	assetCount: number,
	candidates: TransactionPackingCandidate[],
): number[] | undefined {
	if (!Number.isInteger(assetCount) || assetCount < 1 || assetCount > 10) {
		throw new Error("INVALID_TRANSACTION_PACKING_ASSET_COUNT");
	}
	const fullMask = (1 << assetCount) - 1;
	const sizeByMask = new Map(
		candidates
			.filter(
				(candidate) =>
					candidate.mask > 0 &&
					(candidate.mask & ~fullMask) === 0 &&
					candidate.serializedSize > 0,
			)
			.map((candidate) => [candidate.mask, candidate.serializedSize]),
	);
	const memo = new Map<number, number[] | undefined>();

	const solve = (remaining: number): number[] | undefined => {
		if (remaining === 0) return [];
		if (memo.has(remaining)) return memo.get(remaining);
		const first = remaining & -remaining;
		let best: number[] | undefined;
		for (const mask of sizeByMask.keys()) {
			if ((mask & first) === 0 || (mask & remaining) !== mask) continue;
			const tail = solve(remaining ^ mask);
			if (!tail) continue;
			const proposed = [mask, ...tail].sort(lowestAssetFirst);
			if (!best || comparePackings(proposed, best, sizeByMask) < 0) {
				best = proposed;
			}
		}
		memo.set(remaining, best);
		return best;
	};

	return solve(fullMask);
}

function comparePackings(
	left: number[],
	right: number[],
	sizeByMask: Map<number, number>,
) {
	if (left.length !== right.length) return left.length - right.length;
	const leftSizes = left.map((mask) => sizeByMask.get(mask) ?? Infinity);
	const rightSizes = right.map((mask) => sizeByMask.get(mask) ?? Infinity);
	const maxDifference = Math.max(...leftSizes) - Math.max(...rightSizes);
	if (maxDifference !== 0) return maxDifference;
	const squaredDifference =
		leftSizes.reduce((sum, size) => sum + size * size, 0) -
		rightSizes.reduce((sum, size) => sum + size * size, 0);
	if (squaredDifference !== 0) return squaredDifference;
	return left.join(",").localeCompare(right.join(","));
}

function lowestAssetFirst(left: number, right: number) {
	return lowestSetBit(left) - lowestSetBit(right) || left - right;
}

function lowestSetBit(mask: number) {
	return Math.log2(mask & -mask);
}
