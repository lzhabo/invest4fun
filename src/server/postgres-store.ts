import { Pool, type PoolClient } from "pg";
import {
	executionPlanSchema,
	onboardingPreferencesSchema,
	type AppChain,
	type ExecutionPlan,
	type ExecutionProviderId,
	type FeedRankingProviderId,
	type OnboardingPreferences,
} from "../domain/schemas.js";
import { executionBudgetUsage } from "./store.js";
import {
	executionLegsFromPlan,
	executionStatusFromLegs,
	transitionExecutionLeg,
	type ExecutionLeg,
	type ExecutionLegTransition,
} from "./execution-legs.js";
import type {
  ExecutionRecord,
  SettledOutput,
  StateStore,
	UserAccount,
  WeeklySession
} from "./store.js";

interface UserAccountRow {
	privy_user_id: string;
	canonical_solana_wallet: string;
	timezone: string;
	onboarding_version: number;
	onboarding_completed_at: Date | null;
	created_at: Date;
}

interface SessionRow {
  id: string;
  owner_id: string | null;
  wallet: string;
  epoch_id: string;
  chain: AppChain | null;
  execution_provider: ExecutionProviderId;
  feed_ranking_provider: FeedRankingProviderId | null;
  status: WeeklySession["status"];
  execution_id: string | null;
  created_at: Date;
}

interface ExecutionRow {
  plan: ExecutionPlan;
  status: ExecutionRecord["status"];
  submission_mode: ExecutionRecord["submissionMode"];
  transaction_hashes: string[];
  settled_outputs: SettledOutput[];
  settled_at: Date | null;
	legs: ExecutionLeg[] | null;
}

export function normalizeStoredWallet(wallet: string, _chain: AppChain) {
	return wallet;
}

export class PostgresStateStore implements StateStore {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
		connectionString: databaseUrl,
		max: 3,
		allowExitOnIdle: true,
		idleTimeoutMillis: 10_000,
		connectionTimeoutMillis: 10_000,
		query_timeout: 15_000,
		statement_timeout: 15_000,
      ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: true }
    });
  }

	async getAccount(privyUserId: string): Promise<UserAccount | undefined> {
		const result = await this.pool.query<UserAccountRow>(
			`SELECT privy_user_id, canonical_solana_wallet, timezone,
			        onboarding_version, onboarding_completed_at, created_at
			 FROM user_accounts WHERE privy_user_id = $1`,
			[privyUserId.toLowerCase()],
		);
		const row = result.rows[0];
		return row
			? {
					privyUserId: row.privy_user_id,
					canonicalSolanaWallet: row.canonical_solana_wallet,
					timezone: row.timezone,
					onboardingVersion: row.onboarding_version,
					onboardingCompletedAt:
						row.onboarding_completed_at?.toISOString() ?? undefined,
					createdAt: row.created_at.toISOString(),
				}
			: undefined;
	}

	async getOrCreateAccount(
		privyUserId: string,
		canonicalSolanaWallet: string,
		timezone: string,
	): Promise<UserAccount> {
		const result = await this.pool.query<UserAccountRow>(
			`INSERT INTO user_accounts (
			   privy_user_id, canonical_solana_wallet, timezone
			 ) VALUES ($1, $2, $3)
			 ON CONFLICT (privy_user_id) DO UPDATE SET
			   timezone = CASE
			     WHEN user_accounts.canonical_solana_wallet = EXCLUDED.canonical_solana_wallet
			     THEN EXCLUDED.timezone
			     ELSE user_accounts.timezone
			   END,
			   updated_at = now()
			 RETURNING privy_user_id, canonical_solana_wallet, timezone,
			   onboarding_version, onboarding_completed_at, created_at`,
			[privyUserId.toLowerCase(), canonicalSolanaWallet, timezone],
		);
		const row = result.rows[0];
		if (!row) throw new Error("ACCOUNT_UPSERT_FAILED");
		if (row.canonical_solana_wallet !== canonicalSolanaWallet) {
			throw new Error("CANONICAL_WALLET_MISMATCH");
		}
		return {
			privyUserId: row.privy_user_id,
			canonicalSolanaWallet: row.canonical_solana_wallet,
			timezone: row.timezone,
			onboardingVersion: row.onboarding_version,
			onboardingCompletedAt:
				row.onboarding_completed_at?.toISOString() ?? undefined,
			createdAt: row.created_at.toISOString(),
		};
	}

	async completeAccountOnboarding(
		privyUserId: string,
		canonicalSolanaWallet: string,
		version: number,
	): Promise<UserAccount> {
		const result = await this.pool.query<UserAccountRow>(
			`INSERT INTO user_accounts (
			   privy_user_id, canonical_solana_wallet, timezone,
			   onboarding_version, onboarding_completed_at
			 ) VALUES ($1, $2, 'UTC', $3, now())
			 ON CONFLICT (privy_user_id) DO UPDATE SET
			   onboarding_version = EXCLUDED.onboarding_version,
			   onboarding_completed_at = COALESCE(
			     user_accounts.onboarding_completed_at,
			     EXCLUDED.onboarding_completed_at
			   ),
			   updated_at = now()
			 WHERE user_accounts.canonical_solana_wallet = EXCLUDED.canonical_solana_wallet
			 RETURNING privy_user_id, canonical_solana_wallet, timezone,
			   onboarding_version, onboarding_completed_at, created_at`,
			[privyUserId.toLowerCase(), canonicalSolanaWallet, version],
		);
		const row = result.rows[0];
		if (!row) throw new Error("CANONICAL_WALLET_MISMATCH");
		return {
			privyUserId: row.privy_user_id,
			canonicalSolanaWallet: row.canonical_solana_wallet,
			timezone: row.timezone,
			onboardingVersion: row.onboarding_version,
			onboardingCompletedAt:
				row.onboarding_completed_at?.toISOString() ?? undefined,
			createdAt: row.created_at.toISOString(),
		};
	}

  async getPeriodBudgetUsage(ownerId: string, epochId: string) {
    const result = await this.pool.query<ExecutionRow>(
      `SELECT e.plan, e.status, e.submission_mode, e.transaction_hashes,
              e.settled_outputs, e.settled_at, e.legs
       FROM executions e JOIN weekly_sessions s ON s.id = e.session_id
       WHERE lower(s.owner_id) = lower($1) AND s.epoch_id = $2`,
      [ownerId, epochId]
    );
    return result.rows
      .map(mapExecution)
      .reduce((sum, execution) => sum + executionBudgetUsage(execution), 0n)
      .toString();
  }

  async getProviderSnapshot(key: string) {
    const result = await this.pool.query<{
      snapshot: unknown;
      expires_at: Date;
    }>(
      `SELECT snapshot, expires_at FROM asset_metadata_cache
       WHERE cache_key = $1 AND expires_at > now()`,
      [key]
    );
    const row = result.rows[0];
    return row
      ? { value: row.snapshot, expiresAt: row.expires_at.toISOString() }
      : undefined;
  }

  async setProviderSnapshot(
    key: string,
    provider: string,
    value: unknown,
    expiresAt: string
  ) {
    await this.pool.query(
      `INSERT INTO asset_metadata_cache (
         cache_key, provider, snapshot, expires_at
       ) VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (cache_key) DO UPDATE SET
         provider = EXCLUDED.provider,
         snapshot = EXCLUDED.snapshot,
         expires_at = EXCLUDED.expires_at,
         updated_at = now()`,
      [key, provider, JSON.stringify(value), expiresAt]
    );
  }

  async getPreferences(ownerId: string) {
    const result = await this.pool.query<{ preferences: unknown }>(
		`SELECT preferences FROM user_preferences WHERE owner_id = $1`,
      [ownerId.toLowerCase()]
    );
    return result.rows[0]
      ? onboardingPreferencesSchema.parse(result.rows[0].preferences)
      : undefined;
  }

  async setPreferences(
    ownerId: string,
    preferences: OnboardingPreferences,
    wallet = ownerId
  ) {
    const parsed = onboardingPreferencesSchema.parse(preferences);
    await this.pool.query(
		`INSERT INTO user_preferences (wallet, owner_id, execution_provider, preferences)
		 VALUES ($1, $2, $3, $4::jsonb)
		 ON CONFLICT (owner_id) DO UPDATE
       SET wallet = EXCLUDED.wallet,
           execution_provider = EXCLUDED.execution_provider,
           preferences = EXCLUDED.preferences,
           updated_at = now()`,
      [
        normalizeStoredWallet(wallet, parsed.activeChain),
        ownerId.toLowerCase(),
        parsed.executionProvider,
        JSON.stringify(parsed)
      ]
    );
    return parsed;
  }

  async invalidatePreparedExecutions(ownerId: string) {
    const normalized = ownerId.toLowerCase();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const prepared = await client.query<{ id: string }>(
        `SELECT e.id
         FROM executions e
         JOIN weekly_sessions s ON s.id = e.session_id
		 WHERE s.owner_id = $1
           AND e.status = 'PREPARED'
         FOR UPDATE`,
        [normalized]
      );
      const ids = prepared.rows.map((row) => row.id);
      if (ids.length) {
        await client.query(
          `UPDATE weekly_sessions
           SET execution_id = NULL, status = 'OPEN', updated_at = now()
           WHERE execution_id = ANY($1::uuid[])`,
          [ids]
        );
        await client.query(
          "DELETE FROM executions WHERE id = ANY($1::uuid[]) AND status = 'PREPARED'",
          [ids]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async openSession(
    wallet: string,
    epochId: string,
    executionProvider: ExecutionProviderId,
    chain: AppChain = "SOLANA",
    ownerId = wallet,
		feedRankingProvider: FeedRankingProviderId = "DETERMINISTIC"
  ): Promise<WeeklySession> {
    const normalizedWallet = normalizeStoredWallet(wallet, chain);
    const result = await this.pool.query<SessionRow>(
      `INSERT INTO weekly_sessions (
         wallet, owner_id, epoch_id, chain, execution_provider, feed_ranking_provider, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'OPEN')
       ON CONFLICT (wallet, epoch_id, chain, execution_provider, feed_ranking_provider)
       DO UPDATE SET owner_id = EXCLUDED.owner_id
       RETURNING id, owner_id, wallet, epoch_id, chain, execution_provider, feed_ranking_provider, status, execution_id, created_at`,
      [normalizedWallet, ownerId.toLowerCase(), epochId, chain, executionProvider, feedRankingProvider]
    );
    const row = result.rows[0];
    if (!row) throw new Error("SESSION_UPSERT_FAILED");
    return mapSession(row);
  }

  async getSession(id: string): Promise<WeeklySession | undefined> {
    const result = await this.pool.query<SessionRow>(
      `SELECT id, owner_id, wallet, epoch_id, chain, execution_provider, feed_ranking_provider, status, execution_id, created_at
       FROM weekly_sessions WHERE id = $1`,
      [id]
    );
    return result.rows[0] ? mapSession(result.rows[0]) : undefined;
  }

  async reserveExecution(
    sessionId: string,
    plan: ExecutionPlan,
    periodBudgetBaseUnits?: string
  ): Promise<ExecutionRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const sessionResult = await client.query<SessionRow>(
        `SELECT id, owner_id, wallet, epoch_id, chain, execution_provider, feed_ranking_provider, status, execution_id, created_at
         FROM weekly_sessions WHERE id = $1 FOR UPDATE`,
        [sessionId]
      );
      const session = sessionResult.rows[0];
      if (!session) throw new Error("SESSION_NOT_FOUND");
      if (session.execution_id) {
        const existing = await this.getExecutionWithClient(client, session.execution_id);
        if (existing?.plan.authorizedPlanHash === plan.authorizedPlanHash) {
          await client.query("COMMIT");
          return existing;
        }
        throw new Error("EPOCH_ALREADY_EXECUTED");
      }
      if (periodBudgetBaseUnits) {
        await client.query(
          `SELECT id FROM weekly_sessions
           WHERE lower(owner_id) = lower($1) AND epoch_id = $2
           FOR UPDATE`,
          [session.owner_id, session.epoch_id]
        );
        const executions = await client.query<ExecutionRow>(
          `SELECT e.plan, e.status, e.submission_mode, e.transaction_hashes,
                  e.settled_outputs, e.settled_at, e.legs
           FROM executions e
           JOIN weekly_sessions s ON s.id = e.session_id
           WHERE lower(s.owner_id) = lower($1) AND s.epoch_id = $2`,
          [session.owner_id, session.epoch_id]
        );
        const consumed = executions.rows
          .map(mapExecution)
          .reduce((sum, execution) => sum + executionBudgetUsage(execution), 0n);
        if (consumed + BigInt(plan.totalInputBaseUnits) > BigInt(periodBudgetBaseUnits)) {
          throw new Error("PERIOD_BUDGET_EXCEEDED");
        }
      }
      await client.query(
        `INSERT INTO executions (
           id, session_id, authorized_plan_hash, execution_provider, plan, status, legs
         )
         VALUES ($1, $2, $3, $4, $5::jsonb, 'PREPARED', $6::jsonb)`,
        [
          plan.executionId,
          sessionId,
          plan.authorizedPlanHash,
          plan.provider,
          JSON.stringify(plan),
					JSON.stringify(executionLegsFromPlan(plan)),
        ]
      );
      await client.query(
        `UPDATE weekly_sessions
         SET execution_id = $1, status = 'AWAITING_SIGNATURE'
         WHERE id = $2`,
        [plan.executionId, sessionId]
      );
      await client.query("COMMIT");
      return {
        plan,
        status: "PREPARED",
        submissionMode: "SEQUENTIAL",
        transactionHashes: [],
        settledOutputs: [],
				legs: executionLegsFromPlan(plan),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getExecution(id: string): Promise<ExecutionRecord | undefined> {
    const client = await this.pool.connect();
    try {
      return await this.getExecutionWithClient(client, id);
    } finally {
      client.release();
    }
  }

	async listExecutionsForReconciliation(limit: number) {
		const result = await this.pool.query<ExecutionRow>(
			`SELECT plan, status, submission_mode, transaction_hashes,
			        settled_outputs, settled_at, legs
			 FROM executions
			 WHERE status = 'SUBMITTED'
			 ORDER BY updated_at ASC
			 LIMIT $1`,
			[limit],
		);
		return result.rows.map(mapExecution);
	}

  async refreshPreparedExecution(
    id: string,
    expectedAuthorizedPlanHash: string,
    plan: ExecutionPlan,
    periodBudgetBaseUnits?: string
  ): Promise<ExecutionRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (periodBudgetBaseUnits) {
        const context = await client.query<{ owner_id: string; epoch_id: string }>(
          `SELECT s.owner_id, s.epoch_id
           FROM executions e JOIN weekly_sessions s ON s.id = e.session_id
           WHERE e.id = $1 FOR UPDATE OF e, s`,
          [id]
        );
        const session = context.rows[0];
        if (!session) throw new Error("EXECUTION_NOT_FOUND");
        await client.query(
          `SELECT id FROM weekly_sessions
           WHERE lower(owner_id) = lower($1) AND epoch_id = $2
           FOR UPDATE`,
          [session.owner_id, session.epoch_id]
        );
        const executions = await client.query<ExecutionRow>(
          `SELECT e.plan, e.status, e.submission_mode, e.transaction_hashes,
                  e.settled_outputs, e.settled_at, e.legs
           FROM executions e JOIN weekly_sessions s ON s.id = e.session_id
           WHERE lower(s.owner_id) = lower($1) AND s.epoch_id = $2 AND e.id <> $3`,
          [session.owner_id, session.epoch_id, id]
        );
        const consumed = executions.rows
          .map(mapExecution)
          .reduce((sum, execution) => sum + executionBudgetUsage(execution), 0n);
        if (consumed + BigInt(plan.totalInputBaseUnits) > BigInt(periodBudgetBaseUnits)) {
          throw new Error("PERIOD_BUDGET_EXCEEDED");
        }
      }
      const result = await client.query<ExecutionRow>(
        `UPDATE executions
         SET plan = $2::jsonb,
             authorized_plan_hash = $4,
             legs = $5::jsonb,
             updated_at = now()
         WHERE id = $1
           AND status = 'PREPARED'
           AND authorized_plan_hash = $3
         RETURNING plan, status, submission_mode, transaction_hashes, settled_outputs, settled_at, legs`,
        [
          id,
          JSON.stringify({ ...plan, executionId: id }),
          expectedAuthorizedPlanHash,
          plan.authorizedPlanHash,
					JSON.stringify(executionLegsFromPlan({ ...plan, executionId: id })),
        ]
      );
      if (!result.rows[0]) throw new Error("EPOCH_ALREADY_EXECUTED");
      await client.query("COMMIT");
      return mapExecution(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateExecution(
    id: string,
    status: ExecutionRecord["status"],
    transactionHashes: string[] = [],
    settledOutputs: SettledOutput[] = [],
    submissionMode: ExecutionRecord["submissionMode"] = "SEQUENTIAL"
  ): Promise<ExecutionRecord> {
    const terminal = ["SETTLED", "PARTIAL", "FAILED"].includes(status);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<ExecutionRow>(
        `UPDATE executions
       SET status = $2,
           transaction_hashes = $3,
           settled_outputs = $4::jsonb,
           submission_mode = $5,
           settled_at = CASE WHEN $6 THEN now() ELSE settled_at END,
           updated_at = now()
       WHERE id = $1
       RETURNING plan, status, submission_mode, transaction_hashes, settled_outputs, settled_at, legs`,
        [id, status, transactionHashes, JSON.stringify(settledOutputs), submissionMode, terminal]
      );
      if (!result.rows[0]) throw new Error("EXECUTION_NOT_FOUND");
      if (terminal) {
        await client.query(
          `UPDATE weekly_sessions
           SET execution_id = NULL, status = 'OPEN', updated_at = now()
           WHERE execution_id = $1`,
          [id]
        );
      }
      await client.query("COMMIT");
      return mapExecution(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

	async transitionExecutionLeg(
		id: string,
		legIndex: number,
		transition: ExecutionLegTransition,
	): Promise<ExecutionRecord> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN");
			const selected = await client.query<ExecutionRow>(
				`SELECT plan, status, submission_mode, transaction_hashes,
				        settled_outputs, settled_at, legs
				 FROM executions WHERE id = $1 FOR UPDATE`,
				[id],
			);
			const row = selected.rows[0];
			if (!row) throw new Error("EXECUTION_NOT_FOUND");
			const current = mapExecution(row);
			const leg = current.legs[legIndex];
			if (!leg || leg.index !== legIndex) {
				throw new Error("EXECUTION_LEG_NOT_FOUND");
			}
			const legs = current.legs.map((item, index) =>
				index === legIndex ? transitionExecutionLeg(item, transition) : item,
			);
			const status = executionStatusFromLegs(legs);
			const terminal = ["SETTLED", "PARTIAL", "FAILED"].includes(status);
			const result = await client.query<ExecutionRow>(
				`UPDATE executions
				 SET legs = $2::jsonb,
				     status = $3,
				     transaction_hashes = $4,
				     settled_at = CASE WHEN $5 THEN now() ELSE settled_at END,
				     updated_at = now()
				 WHERE id = $1
				 RETURNING plan, status, submission_mode, transaction_hashes,
				           settled_outputs, settled_at, legs`,
				[
					id,
					JSON.stringify(legs),
					status,
					legs.flatMap((item) => item.signature ?? []),
					terminal,
				],
			);
			if (terminal) {
				await client.query(
					`UPDATE weekly_sessions
					 SET execution_id = NULL, status = 'OPEN', updated_at = now()
					 WHERE execution_id = $1`,
					[id],
				);
			}
			await client.query("COMMIT");
			const updated = result.rows[0];
			if (!updated) throw new Error("EXECUTION_NOT_FOUND");
			return mapExecution(updated);
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		} finally {
			client.release();
		}
	}

  private async getExecutionWithClient(client: PoolClient, id: string) {
    const result = await client.query<ExecutionRow>(
      `SELECT plan, status, submission_mode, transaction_hashes, settled_outputs, settled_at, legs
       FROM executions WHERE id = $1`,
      [id]
    );
    return result.rows[0] ? mapExecution(result.rows[0]) : undefined;
  }
}

function mapSession(row: SessionRow): WeeklySession {
  return {
    id: row.id,
    ownerId: row.owner_id ?? row.wallet,
    wallet: row.wallet,
    epochId: row.epoch_id,
		chain: row.chain ?? "SOLANA",
    executionProvider: row.execution_provider,
		feedRankingProvider: row.feed_ranking_provider ?? "DETERMINISTIC",
    status: row.status,
    executionId: row.execution_id ?? undefined,
    createdAt: row.created_at.toISOString()
  };
}

function mapExecution(row: ExecutionRow): ExecutionRecord {
	const plan = executionPlanSchema.parse(row.plan);
  return {
		plan,
    status: row.status,
    submissionMode: row.submission_mode,
    transactionHashes: row.transaction_hashes,
    settledOutputs: row.settled_outputs,
		settledAt: row.settled_at?.toISOString(),
		legs: row.legs?.length ? row.legs : executionLegsFromPlan(plan),
  };
}
