import { expect, it, vi } from "vitest";
import { sha256 } from "../src/domain/canonical.js";
import { rankingInputSchema } from "../src/domain/schemas.js";
import { SolanaDemoCandidateProvider } from "../src/server/adapters/solana-demo.js";
import {
	DEFAULT_ZG_MODEL,
	compactRankingInput,
	PORTFOLIO_DRAFT_SYSTEM_PROMPT,
	ZeroGProvider,
} from "../src/server/adapters/zero-g.js";

async function rankingInput() {
	const candidates =
		await new SolanaDemoCandidateProvider().getRankingCandidates(60);
	const unsigned = {
		schemaVersion: "investmade-ranking-input/v1" as const,
		sessionId: "test-session",
		epochId: "test-epoch",
		policyVersion: "investmade-policy/v1" as const,
		budget: {
			periodBudgetBaseUnits: "100000000",
			slotBudgetBaseUnits: "10000000",
			maxCards: 10,
		},
		preferences: {
			cadence: "weekly" as const,
			ticketSizeUsd: 10,
			riskMode: "balanced" as const,
			assetClasses: ["CRYPTO", "STOCK_TOKEN"] as const,
		},
		candidates,
	};
	return rankingInputSchema.parse({
		...unsigned,
		inputCommitment: sha256(unsigned),
	});
}

it("keeps a 60-asset discovery universe available to personalization", async () => {
	const input = await rankingInput();
	const seed = input.candidates[0];
	if (!seed) throw new Error("ranking fixture missing");
	const candidates = Array.from({ length: 60 }, (_, index) => ({
		...seed,
		assetId: `rh:4663:TEST${index + 1}`,
		symbol: `TEST${index + 1}`,
		discoveryRank: index + 1,
	}));
	const unsigned = {
		...input,
		candidates,
	};
	const expanded = rankingInputSchema.parse({
		...unsigned,
		inputCommitment: sha256({
			schemaVersion: unsigned.schemaVersion,
			sessionId: unsigned.sessionId,
			epochId: unsigned.epochId,
			policyVersion: unsigned.policyVersion,
			budget: unsigned.budget,
			preferences: unsigned.preferences,
			candidates,
		}),
	});

	const { modelInput } = compactRankingInput(expanded);

	expect(modelInput.candidates).toHaveLength(60);
	expect(modelInput.candidates.at(-1)?.key).toBe("c60");
});

function modelOutput(input: Awaited<ReturnType<typeof rankingInput>>) {
	const { modelInput } = compactRankingInput(input);
	return {
		regime: "CRYPTO_NEUTRAL",
		top: modelInput.candidates.map((candidate, index) => ({
			key: candidate.key,
			score: 90 - index,
		})),
	};
}

it("uses the compact response contract and generates reasons on the server", async () => {
	const input = await rankingInput();
	const output = modelOutput(input);
	const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
		new Response(
			JSON.stringify({
				choices: [{ message: { content: JSON.stringify(output) } }],
				usage: { prompt_tokens: 500, completion_tokens: 300 },
				x_0g_trace: { tee_verified: true, provider: "0xprovider" },
			}),
			{ status: 200 },
		),
	);

	const result = await new ZeroGProvider("secret").rank(input);
	const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
	const body = JSON.parse(String(init.body));
	const sentInput = JSON.parse(body.messages[1].content);

	expect(
		(init.headers as Record<string, string>)["X-0G-Provider-Trust-Mode"],
	).toBe("verified");
	expect(body.verify_tee).toBe(true);
	expect(body.max_tokens).toBe(400);
	expect(body.messages[0].content).not.toContain('"reason"');
	expect(body.messages[0].content).not.toContain('"warnings"');
	expect(sentInput.candidates[0]).toMatchObject({ key: "c01" });
	expect(JSON.stringify(sentInput)).not.toContain("assetId");
	expect(JSON.stringify(sentInput)).not.toContain("inputCommitment");
	expect(result.output.assets.map((asset) => asset.assetId)).toEqual(
		input.candidates.map((candidate) => candidate.assetId),
	);
	expect(result.output.assets[0]?.reason).toContain(
		"scored 90/100 for your balanced weekly plan",
	);
	expect(result.output.warnings).toEqual([]);
	expect(result.diagnostics).toMatchObject({
		transport: "native",
		promptTokens: 500,
		completionTokens: 300,
	});
	fetchMock.mockRestore();
});

it("falls back to fenced plain-text JSON when native JSON mode is unsupported", async () => {
	const input = await rankingInput();
	const output = modelOutput(input);
	const fetchMock = vi
		.spyOn(globalThis, "fetch")
		.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					error: {
						message:
							"model does not support JSON mode (response_format: json_object)",
					},
				}),
				{ status: 400 },
			),
		)
		.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					choices: [
						{
							message: {
								content: `\`\`\`json\n${JSON.stringify(output)}\n\`\`\``,
							},
						},
					],
					x_0g_trace: { tee_verified: true },
				}),
				{ status: 200 },
			),
		);

	const result = await new ZeroGProvider(
		"secret",
		"plain-model",
		"verified",
		"auto",
	).rank(input);
	const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
	const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));

	expect(firstBody.response_format).toEqual({ type: "json_object" });
	expect(secondBody.response_format).toBeUndefined();
	expect(result.diagnostics.transport).toBe("text");
	fetchMock.mockRestore();
});

it("rejects an invented candidate key", async () => {
	const input = await rankingInput();
	vi.spyOn(globalThis, "fetch").mockResolvedValue(
		new Response(
			JSON.stringify({
				choices: [
					{
						message: {
							content: JSON.stringify({
								regime: "CRYPTO_NEUTRAL",
								top: [{ key: "c99", score: 50 }],
							}),
						},
					},
				],
				x_0g_trace: { tee_verified: true },
			}),
			{ status: 200 },
		),
	);

	await expect(new ZeroGProvider("secret").rank(input)).rejects.toThrow(
		"MODEL_UNKNOWN_CANDIDATE_KEY:c99",
	);
	vi.restoreAllMocks();
});

it("rejects legacy model-generated reason and warnings fields", async () => {
	const input = await rankingInput();
	const output = modelOutput(input);
	vi.spyOn(globalThis, "fetch").mockResolvedValue(
		new Response(
			JSON.stringify({
				choices: [
					{
						message: {
							content: JSON.stringify({
								...output,
								warnings: ["legacy"],
								top: output.top.map((asset) => ({
									...asset,
									reason: "legacy",
								})),
							}),
						},
					},
				],
				x_0g_trace: { tee_verified: true },
			}),
			{ status: 200 },
		),
	);

	await expect(new ZeroGProvider("secret").rank(input)).rejects.toThrow();
	vi.restoreAllMocks();
});

const portfolioInput = {
	prompt: "ozempic companies",
	maxHoldings: 6,
	candidates: [
		{
			key: "a000",
			symbol: "SOL",
			name: "Solana",
			kind: "CRYPTO" as const,
			classification: "CRYPTO",
			tags: ["crypto"],
		},
		{
			key: "a001",
			symbol: "NVOx",
			name: "Novo Nordisk xStock",
			kind: "STOCK_TOKEN" as const,
			classification: "TOKENIZED_STOCK",
			tags: ["pharmaceuticals", "GLP-1", "Ozempic"],
		},
		{
			key: "a002",
			symbol: "LLYx",
			name: "Eli Lilly xStock",
			kind: "STOCK_TOKEN" as const,
			classification: "TOKENIZED_STOCK",
			tags: ["pharmaceuticals", "GLP-1", "Mounjaro"],
		},
	],
};

it("uses Qwen for two-pass thesis selection without exposing asset IDs", async () => {
	const fetchMock = vi
		.spyOn(globalThis, "fetch")
		.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					choices: [
						{
							message: { content: JSON.stringify({ keys: ["a001", "a002"] }) },
						},
					],
					x_0g_trace: { tee_verified: true },
				}),
				{ status: 200 },
			),
		)
		.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					choices: [
						{
							message: {
								content: JSON.stringify({
									status: "OK",
									name: "GLP-1 companies draft",
									description:
										"An editable draft of supplied GLP-1 company candidates.",
									holdings: [
										{
											key: "a001",
											scoreBps: 9800,
											reason:
												"Its supplied tags explicitly include Ozempic and GLP-1.",
											exposureType: "DIRECT",
										},
										{
											key: "a002",
											scoreBps: 8500,
											reason:
												"Its supplied tags identify another GLP-1 company.",
											exposureType: "DIRECT",
										},
									],
								}),
							},
						},
					],
					x_0g_trace: { tee_verified: true },
				}),
				{ status: 200 },
			),
		);

	const result = await new ZeroGProvider("secret").generatePortfolioDraft(
		portfolioInput,
	);
	const bodies = fetchMock.mock.calls.map((call) =>
		JSON.parse(String((call[1] as RequestInit | undefined)?.body)),
	);
	const shortlistInput = JSON.parse(bodies[0].messages[1].content);
	const selectionInput = JSON.parse(bodies[1].messages[1].content);

	expect(bodies).toHaveLength(2);
	expect(bodies.every((body) => body.model === DEFAULT_ZG_MODEL)).toBe(true);
	expect(bodies.every((body) => body.verify_tee === true)).toBe(true);
	expect(JSON.stringify(shortlistInput)).not.toContain("assetId");
	expect(shortlistInput.candidates).toHaveLength(3);
	expect(
		selectionInput.candidates.map(
			(candidate: { symbol: string }) => candidate.symbol,
		),
	).toEqual(["NVOx", "LLYx"]);
	expect(bodies[1].messages[0].content).toBe(PORTFOLIO_DRAFT_SYSTEM_PROMPT);
	expect(bodies[1].messages[0].content).toContain("do not select crypto");
	expect(
		(result as { holdings: Array<{ key: string }> }).holdings.map(
			({ key }) => key,
		),
	).toEqual(["a001", "a002"]);
	fetchMock.mockRestore();
});

it("fails closed when the shortlist contains an unknown candidate key", async () => {
	vi.spyOn(globalThis, "fetch").mockResolvedValue(
		new Response(
			JSON.stringify({
				choices: [{ message: { content: JSON.stringify({ keys: ["a999"] }) } }],
				x_0g_trace: { tee_verified: true },
			}),
			{ status: 200 },
		),
	);

	await expect(
		new ZeroGProvider("secret").generatePortfolioDraft(portfolioInput),
	).rejects.toThrow("MODEL_UNKNOWN_CANDIDATE_KEY:a999");
	vi.restoreAllMocks();
});

it("fails closed when the shortlist repeats a candidate key", async () => {
	vi.spyOn(globalThis, "fetch").mockResolvedValue(
		new Response(
			JSON.stringify({
				choices: [
					{ message: { content: JSON.stringify({ keys: ["a001", "a001"] }) } },
				],
				x_0g_trace: { tee_verified: true },
			}),
			{ status: 200 },
		),
	);

	await expect(
		new ZeroGProvider("secret").generatePortfolioDraft(portfolioInput),
	).rejects.toThrow("MODEL_DUPLICATE_CANDIDATE_KEY:a001");
	vi.restoreAllMocks();
});
