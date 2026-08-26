const CHAIN_MARKS = {
	SOLANA: {
		label: "Solana",
		src: "/assets/chains/solana.svg",
	},
};

export function ChainMark({
	chain,
	size = 20,
}: {
	chain: "SOLANA";
	size?: number;
}) {
	const mark = CHAIN_MARKS[chain];

	return (
		<img
			className={`chain-mark chain-mark-${chain.toLowerCase()}`}
			src={mark.src}
			width={size}
			height={size}
			alt=""
			aria-hidden="true"
		/>
	);
}
