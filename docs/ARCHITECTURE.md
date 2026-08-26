# Architecture

## Runtime

The product runtime is Solana-only. Express owns the HTTP interface, Privy verifies the selected Solana wallet, and the store owns sessions, preferences, prepared executions, submissions, and receipts.

```text
React + Privy Solana wallet
          |
          v
    Express HTTP module
      |      |      |
      v      v      v
  ranking  policy  execution
   0G /    pure     Jupiter / 0x
 deterministic      Solana
      \      |      /
       \     v     /
        StateStore
     memory / Postgres
```

## Deep modules and seams

- Candidate/execution seam: `CandidateProvider` and `ExecutionProvider`. Demo, Jupiter, and 0x are concrete adapters; callers do not know provider transport details.
- Ranking seam: `PrivateInferenceProvider`. 0G and deterministic ranking share the same observable interface.
- Market-data seam: `MarketDataProvider`. CoinGecko hides batching, caching, Solana on-chain lookup, history fallback, and graceful degradation.
- Persistence seam: `StateStore`. In-memory and Postgres adapters preserve identical session/execution behavior.
- Authentication seam: `PrivyWalletAuth` resolves one verified Solana execution actor.

## Execution lifecycle

1. Open a Solana cadence session using Jupiter or 0x.
2. Discover and enrich Solana candidates.
3. Rank candidates through 0G or deterministic ranking.
4. Revalidate selected assets and build fresh exact-input routes.
5. Persist the authorized plan hash, policy hash, quotes, and unsigned Solana transaction.
6. The selected Privy wallet signs the serialized transaction.
7. The backend submits it and reconciles confirmed token-balance changes.
8. Persist a terminal `SETTLED`, `PARTIAL`, or `FAILED` receipt.

## Compatibility

Old migrations and execution-plan decoding still understand pre-migration rows. Compatibility is deliberately read-only: new preferences, sessions, preparations, submissions, and exits are validated as Solana. Legacy constants live in `src/domain/legacy-execution.ts`; they are not runtime configuration.

## Modes

- Demo: offline Solana fixtures and simulated settlement.
- Local-live: repeatable in-memory sessions with real Solana quotes/signing; forbidden in production.
- Production: Postgres persistence and live Solana providers.
