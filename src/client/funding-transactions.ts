import {
	PublicKey,
	SystemProgram,
	Transaction,
	TransactionInstruction,
} from "@solana/web3.js";

const TOKEN_PROGRAM_ID = new PublicKey(
	"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
	"ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

export function buildSolFundingTransaction(input: {
	from: string;
	to: string;
	solAmount: number;
	blockhash: string;
}): Uint8Array {
	const from = new PublicKey(input.from);
	const to = new PublicKey(input.to);
	const lamports = decimalToBaseUnits(input.solAmount, 9);
	const transaction = new Transaction({
		feePayer: from,
		recentBlockhash: input.blockhash,
	}).add(SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports }));
	return transaction.serialize({
		requireAllSignatures: false,
		verifySignatures: false,
	});
}

export function buildUsdcFundingTransaction(input: {
	from: string;
	to: string;
	usdcAmount: number;
	blockhash: string;
	mint: string;
	decimals?: number;
}): Uint8Array {
	const from = new PublicKey(input.from);
	const to = new PublicKey(input.to);
	const mint = new PublicKey(input.mint);
	const decimals = input.decimals ?? 6;
	const amount = decimalToBaseUnits(input.usdcAmount, decimals);
	const sourceAta = associatedTokenAddress(from, mint);
	const destinationAta = associatedTokenAddress(to, mint);
	const createDestination = new TransactionInstruction({
		programId: ASSOCIATED_TOKEN_PROGRAM_ID,
		keys: [
			{ pubkey: from, isSigner: true, isWritable: true },
			{ pubkey: destinationAta, isSigner: false, isWritable: true },
			{ pubkey: to, isSigner: false, isWritable: false },
			{ pubkey: mint, isSigner: false, isWritable: false },
			{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
			{ pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
		],
		data: Buffer.from([1]),
	});
	const transferData = Buffer.alloc(10);
	transferData.writeUInt8(12, 0);
	transferData.writeBigUInt64LE(amount, 1);
	transferData.writeUInt8(decimals, 9);
	const transfer = new TransactionInstruction({
		programId: TOKEN_PROGRAM_ID,
		keys: [
			{ pubkey: sourceAta, isSigner: false, isWritable: true },
			{ pubkey: mint, isSigner: false, isWritable: false },
			{ pubkey: destinationAta, isSigner: false, isWritable: true },
			{ pubkey: from, isSigner: true, isWritable: false },
		],
		data: transferData,
	});
	const transaction = new Transaction({
		feePayer: from,
		recentBlockhash: input.blockhash,
	}).add(createDestination, transfer);
	return transaction.serialize({
		requireAllSignatures: false,
		verifySignatures: false,
	});
}

function associatedTokenAddress(owner: PublicKey, mint: PublicKey) {
	return PublicKey.findProgramAddressSync(
		[owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
		ASSOCIATED_TOKEN_PROGRAM_ID,
	)[0];
}

function decimalToBaseUnits(amount: number, decimals: number) {
	if (!Number.isFinite(amount) || amount <= 0) {
		throw new Error("FUNDING_AMOUNT_INVALID");
	}
	const baseUnits = Math.round(amount * 10 ** decimals);
	if (!Number.isSafeInteger(baseUnits) || baseUnits <= 0) {
		throw new Error("FUNDING_AMOUNT_INVALID");
	}
	return BigInt(baseUnits);
}
