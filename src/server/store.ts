import { randomUUID } from "node:crypto";
import type {
	AppChain,
	ExecutionPlan,
	ExecutionProviderId,
	FeedRankingProviderId,
	OnboardingPreferences,
} from "../domain/schemas.js";
import type { ProviderSnapshotCache } from "./adapters/types.js";
import {
	executionLegsFromPlan,
	executionStatusFromLegs,
	transitionExecutionLeg,
	type ExecutionLeg,
	type ExecutionLegTransition,
} from "./execution-legs.js";

export type SessionStatus =
	| "OPEN"
	| "SWIPING"
	| "REVIEW"
	| "AWAITING_SIGNATURE"
	| "SUBMITTED"
	| "SETTLED"
	| "PARTIAL"
	| "FAILED"
	| "CLOSED";

export interface WeeklySession {
	id: string;
	ownerId: string;
	wallet: string;
	epochId: string;
	chain: AppChain;
	executionProvider: ExecutionProviderId;
	feedRankingProvider: FeedRankingProviderId;
	status: SessionStatus;
	executionId?: string;
	createdAt: string;
}

export interface ExecutionRecord {
	plan: ExecutionPlan;
	status: "PREPARED" | "SUBMITTED" | "SETTLED" | "PARTIAL" | "FAILED";
	submissionMode: "SEQUENTIAL" | "BATCH";
	transactionHashes: string[];
	settledOutputs: SettledOutput[];
	settledAt?: string;
	legs: ExecutionLeg[];
}

export interface SettledOutput {
	assetId: string;
	amountOutBaseUnits: string;
	transactionHash: string;
	blockNumber?: string;
	status: "success" | "failed" | "unverified";
}

export interface UserAccount {
	privyUserId: string;
	canonicalSolanaWallet: string;
	timezone: string;
	onboardingVersion: number;
	onboardingCompletedAt?: string;
	createdAt: string;
}

export interface StateStore extends ProviderSnapshotCache {
	getAccount(privyUserId: string): Promise<UserAccount | undefined>;
	getOrCreateAccount(
		privyUserId: string,
		canonicalSolanaWallet: string,
		timezone: string,
	): Promise<UserAccount>;
	completeAccountOnboarding(
		privyUserId: string,
		canonicalSolanaWallet: string,
		version: number,
	): Promise<UserAccount>;
	getPeriodBudgetUsage(ownerId: string, epochId: string): Promise<string>;
	getPreferences(ownerId: string): Promise<OnboardingPreferences | undefined>;
	setPreferences(
		ownerId: string,
		preferences: OnboardingPreferences,
		wallet?: string,
	): Promise<OnboardingPreferences>;
	invalidatePreparedExecutions(ownerId: string): Promise<void>;
	openSession(
		wallet: string,
		epochId: string,
		executionProvider?: ExecutionProviderId,
		chain?: AppChain,
		ownerId?: string,
		feedRankingProvider?: FeedRankingProviderId,
	): Promise<WeeklySession>;
	getSession(id: string): Promise<WeeklySession | undefined>;
	reserveExecution(
		sessionId: string,
		plan: ExecutionPlan,
		periodBudgetBaseUnits?: string,
	): Promise<ExecutionRecord>;
	refreshPreparedExecution(
		id: string,
		expectedAuthorizedPlanHash: string,
		plan: ExecutionPlan,
		periodBudgetBaseUnits?: string,
	): Promise<ExecutionRecord>;
	getExecution(id: string): Promise<ExecutionRecord | undefined>;
	listExecutionsForReconciliation(limit: number): Promise<ExecutionRecord[]>;
	updateExecution(
		id: string,
		status: ExecutionRecord["status"],
		transactionHashes?: string[],
		settledOutputs?: SettledOutput[],
		submissionMode?: ExecutionRecord["submissionMode"],
	): Promise<ExecutionRecord>;
	transitionExecutionLeg(
		id: string,
		legIndex: number,
		transition: ExecutionLegTransition,
	): Promise<ExecutionRecord>;
}

export class MemoryStateStore implements StateStore {
	private readonly accounts = new Map<string, UserAccount>();
	private readonly sessions = new Map<string, WeeklySession>();
	private readonly sessionByEpoch = new Map<string, string>();
	private readonly executions = new Map<string, ExecutionRecord>();
	private readonly preferences = new Map<string, OnboardingPreferences>();
	private readonly providerSnapshots = new Map<
		string,
		{ value: unknown; expiresAt: string }
	>();

	async getAccount(privyUserId: string) {
		return this.accounts.get(privyUserId.toLowerCase());
	}

	async getOrCreateAccount(
		privyUserId: string,
		canonicalSolanaWallet: string,
		timezone: string,
	) {
		const key = privyUserId.toLowerCase();
		const existing = this.accounts.get(key);
		if (existing) {
			if (existing.canonicalSolanaWallet !== canonicalSolanaWallet) {
				throw new Error("CANONICAL_WALLET_MISMATCH");
			}
			const updated = { ...existing, timezone };
			this.accounts.set(key, updated);
			return updated;
		}
		const account: UserAccount = {
			privyUserId,
			canonicalSolanaWallet,
			timezone,
			onboardingVersion: 0,
			createdAt: new Date().toISOString(),
		};
		this.accounts.set(key, account);
		return account;
	}

	async completeAccountOnboarding(
		privyUserId: string,
		canonicalSolanaWallet: string,
		version: number,
	) {
		const existing = await this.getOrCreateAccount(
			privyUserId,
			canonicalSolanaWallet,
			this.accounts.get(privyUserId.toLowerCase())?.timezone ?? "UTC",
		);
		const completed: UserAccount = {
			...existing,
			onboardingVersion: version,
			onboardingCompletedAt:
				existing.onboardingCompletedAt ?? new Date().toISOString(),
		};
		this.accounts.set(privyUserId.toLowerCase(), completed);
		return completed;
	}

	async getPeriodBudgetUsage(ownerId: string, epochId: string) {
		const consumed = [...this.executions.values()]
			.filter((execution) => {
				const session = this.sessions.get(execution.plan.sessionId);
				return (
					session?.ownerId.toLowerCase() === ownerId.toLowerCase() &&
					session.epochId === epochId
				);
			})
			.reduce((sum, execution) => sum + executionBudgetUsage(execution), 0n);
		return consumed.toString();
	}

	async getProviderSnapshot(key: string) {
		const snapshot = this.providerSnapshots.get(key);
		if (!snapshot || Date.parse(snapshot.expiresAt) <= Date.now())
			return undefined;
		return snapshot;
	}

	async setProviderSnapshot(
		key: string,
		_provider: string,
		value: unknown,
		expiresAt: string,
	) {
		this.providerSnapshots.set(key, { value, expiresAt });
	}

	async getPreferences(ownerId: string) {
		return this.preferences.get(ownerId.toLowerCase());
	}

	async setPreferences(ownerId: string, preferences: OnboardingPreferences) {
		this.preferences.set(ownerId.toLowerCase(), preferences);
		return preferences;
	}

	async invalidatePreparedExecutions(ownerId: string) {
		const normalized = ownerId.toLowerCase();
		for (const [sessionId, session] of this.sessions) {
			if (
				session.ownerId.toLowerCase() !== normalized &&
				session.wallet !== normalized
			)
				continue;
			if (!session.executionId) continue;
			const execution = this.executions.get(session.executionId);
			if (execution?.status !== "PREPARED") continue;
			this.executions.delete(session.executionId);
			this.sessions.set(sessionId, {
				...session,
				status: "OPEN",
				executionId: undefined,
			});
		}
	}

	async openSession(
		wallet: string,
		epochId: string,
		executionProvider: ExecutionProviderId = "JUPITER",
		chain: AppChain = "SOLANA",
		ownerId = wallet,
		feedRankingProvider: FeedRankingProviderId = "DETERMINISTIC",
	): Promise<WeeklySession> {
		const normalizedWallet = normalizeWallet(wallet, chain);
		const key = `${normalizedWallet}:${epochId}:${chain}:${executionProvider}:${feedRankingProvider}`;
		const existingId = this.sessionByEpoch.get(key);
		if (existingId) {
			const existing = this.sessions.get(existingId);
			if (!existing) throw new Error("SESSION_INDEX_CORRUPT");
			return existing;
		}

		const session: WeeklySession = {
			id: randomUUID(),
			ownerId,
			wallet: normalizedWallet,
			epochId,
			chain,
			executionProvider,
			feedRankingProvider,
			status: "OPEN",
			createdAt: new Date().toISOString(),
		};
		this.sessions.set(session.id, session);
		this.sessionByEpoch.set(key, session.id);
		return session;
	}

	async getSession(id: string): Promise<WeeklySession | undefined> {
		return this.sessions.get(id);
	}

	async reserveExecution(
		sessionId: string,
		plan: ExecutionPlan,
		periodBudgetBaseUnits?: string,
	): Promise<ExecutionRecord> {
		const session = this.sessions.get(sessionId);
		if (!session) throw new Error("SESSION_NOT_FOUND");
		if (session.executionId) {
			const existing = this.executions.get(session.executionId);
			if (existing?.plan.authorizedPlanHash === plan.authorizedPlanHash)
				return existing;
			throw new Error("EPOCH_ALREADY_EXECUTED");
		}
		if (periodBudgetBaseUnits) {
			const consumed = [...this.executions.values()]
				.filter((execution) => {
					const executionSession = this.sessions.get(execution.plan.sessionId);
					return (
						executionSession?.ownerId.toLowerCase() ===
							session.ownerId.toLowerCase() &&
						executionSession.epochId === session.epochId
					);
				})
				.reduce((sum, execution) => sum + executionBudgetUsage(execution), 0n);
			if (
				consumed + BigInt(plan.totalInputBaseUnits) >
				BigInt(periodBudgetBaseUnits)
			) {
				throw new Error("PERIOD_BUDGET_EXCEEDED");
			}
		}
		const record: ExecutionRecord = {
			plan,
			status: "PREPARED",
			submissionMode: "SEQUENTIAL",
			transactionHashes: [],
			settledOutputs: [],
			legs: executionLegsFromPlan(plan),
		};
		this.executions.set(plan.executionId, record);
		this.sessions.set(sessionId, {
			...session,
			status: "AWAITING_SIGNATURE",
			executionId: plan.executionId,
		});
		return record;
	}

	async getExecution(id: string): Promise<ExecutionRecord | undefined> {
		return this.executions.get(id);
	}

	async listExecutionsForReconciliation(limit: number) {
		return [...this.executions.values()]
			.filter(
				(execution) =>
					execution.status === "SUBMITTED" ||
					execution.legs.some(
						(leg) => leg.failureCode === "OUTPUT_VALIDATION_FAILED",
					),
			)
			.slice(0, limit);
	}

	async refreshPreparedExecution(
		id: string,
		expectedAuthorizedPlanHash: string,
		plan: ExecutionPlan,
		periodBudgetBaseUnits?: string,
	): Promise<ExecutionRecord> {
		const existing = this.executions.get(id);
		if (!existing) throw new Error("EXECUTION_NOT_FOUND");
		if (
			existing.status !== "PREPARED" ||
			existing.plan.authorizedPlanHash !== expectedAuthorizedPlanHash
		) {
			throw new Error("EPOCH_ALREADY_EXECUTED");
		}
		if (periodBudgetBaseUnits) {
			const session = this.sessions.get(existing.plan.sessionId);
			if (!session) throw new Error("SESSION_NOT_FOUND");
			const consumed = [...this.executions.entries()]
				.filter(([executionId, execution]) => {
					if (executionId === id) return false;
					const executionSession = this.sessions.get(execution.plan.sessionId);
					return (
						executionSession?.ownerId.toLowerCase() ===
							session.ownerId.toLowerCase() &&
						executionSession.epochId === session.epochId
					);
				})
				.reduce(
					(sum, [, execution]) => sum + executionBudgetUsage(execution),
					0n,
				);
			if (
				consumed + BigInt(plan.totalInputBaseUnits) >
				BigInt(periodBudgetBaseUnits)
			) {
				throw new Error("PERIOD_BUDGET_EXCEEDED");
			}
		}
		const refreshed = { ...existing, plan: { ...plan, executionId: id } };
		this.executions.set(id, refreshed);
		return refreshed;
	}

	async updateExecution(
		id: string,
		status: ExecutionRecord["status"],
		transactionHashes: string[] = [],
		settledOutputs: SettledOutput[] = [],
		submissionMode: ExecutionRecord["submissionMode"] = "SEQUENTIAL",
	): Promise<ExecutionRecord> {
		const existing = this.executions.get(id);
		if (!existing) throw new Error("EXECUTION_NOT_FOUND");
		const updated = {
			...existing,
			status,
			submissionMode,
			transactionHashes,
			settledOutputs,
			settledAt: ["SETTLED", "PARTIAL", "FAILED"].includes(status)
				? new Date().toISOString()
				: undefined,
		};
		this.executions.set(id, updated);
		if (["SETTLED", "PARTIAL", "FAILED"].includes(status)) {
			for (const [sessionId, session] of this.sessions) {
				if (session.executionId !== id) continue;
				this.sessions.set(sessionId, {
					...session,
					status: "OPEN",
					executionId: undefined,
				});
			}
		}
		return updated;
	}

	async transitionExecutionLeg(
		id: string,
		legIndex: number,
		transition: ExecutionLegTransition,
	): Promise<ExecutionRecord> {
		const existing = this.executions.get(id);
		if (!existing) throw new Error("EXECUTION_NOT_FOUND");
		const current = existing.legs[legIndex];
		if (!current || current.index !== legIndex) {
			throw new Error("EXECUTION_LEG_NOT_FOUND");
		}
		const legs = existing.legs.map((leg, index) =>
			index === legIndex ? transitionExecutionLeg(leg, transition) : leg,
		);
		const status = executionStatusFromLegs(legs);
		const terminal = ["SETTLED", "PARTIAL", "FAILED"].includes(status);
		const updated: ExecutionRecord = {
			...existing,
			legs,
			status,
			transactionHashes: legs.flatMap((leg) => leg.signature ?? []),
			settledAt: terminal ? new Date().toISOString() : undefined,
		};
		this.executions.set(id, updated);
		if (terminal) this.releaseExecutionSession(id);
		return updated;
	}

	private releaseExecutionSession(id: string) {
		for (const [sessionId, session] of this.sessions) {
			if (session.executionId !== id) continue;
			this.sessions.set(sessionId, {
				...session,
				status: "OPEN",
				executionId: undefined,
			});
		}
	}
}

export function executionBudgetUsage(execution: ExecutionRecord): bigint {
	if (execution.status === "FAILED") return 0n;
	if (
		execution.status === "PREPARED" &&
		execution.plan.quotes.every(
			(quote) => Date.parse(quote.expiresAt) <= Date.now(),
		)
	)
		return 0n;
	if (execution.status === "PARTIAL") {
		const successfulAssets = new Set(
			execution.settledOutputs
				.filter((output) => output.status === "success")
				.map((output) => output.assetId),
		);
		return execution.plan.quotes.reduce(
			(sum, quote) =>
				sum +
				(successfulAssets.has(quote.assetId)
					? BigInt(quote.amountInBaseUnits)
					: 0n),
			0n,
		);
	}
	return BigInt(execution.plan.totalInputBaseUnits);
}

function normalizeWallet(wallet: string, _chain: AppChain) {
	return wallet;
}
