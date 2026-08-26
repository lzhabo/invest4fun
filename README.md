# invest4.fun

invest4.fun is a non-custodial Solana investing app. A user sets a recurring USDC budget, receives a personalized feed, selects assets, reviews fresh routes, and explicitly signs the prepared Solana transaction.

The backend ranks and validates candidates; it never signs for the user. Jupiter is the default execution provider, with 0x available as an alternative Solana route. Ranking uses the deterministic module by default and can use 0G with deterministic fallback.

## What is implemented

- Privy authentication and Solana wallet selection.
- Solana-only preferences, sessions, feed, review, execution, reconciliation, receipts, portfolio, and exits.
- Jupiter and 0x Solana execution adapters.
- CoinGecko/GeckoTerminal market enrichment with graceful degradation.
- 0G ranking with deterministic fallback.
- Offline demo mode, local-live mode, and production mode.

Historical database rows created before the Solana-only migration remain readable. Their schema and migrations are compatibility-only: new HTTP requests cannot create or submit those legacy executions.

## Run locally

Requires Node.js 22 or newer.

```bash
npm install
cp .env.example .env
npm run dev
```

The frontend runs on `http://localhost:5173`; Vite proxies `/api` to the backend on port `8787`.

Demo mode is offline for candidates and execution:

```env
INVESTMADE_DEMO_MODE=true
LOCAL_LIVE_EXECUTION=false
```

For local live Solana routes:

```env
INVESTMADE_DEMO_MODE=true
LOCAL_LIVE_EXECUTION=true
JUPITER_API_KEY=...
SOLANA_RPC_URL=...
SOLANA_WS_URL=...
```

Production additionally requires Postgres, CoinGecko, Jupiter, Solana RPC, and Privy credentials. The 0G adapter remains isolated and is not wired into the staging runtime.

Use a pooled Neon connection in `DATABASE_URL` for the Vercel runtime and the direct connection in `DATABASE_URL_UNPOOLED` when running `npm run db:migrate`. Migrations are explicit and are not run by the Vercel build.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Backend module map

- `src/server/app.ts` — HTTP composition and authorization seam.
- `src/server/bootstrap.ts` — runtime adapter selection.
- `src/server/adapters/jupiter.ts` — Jupiter discovery, quote, build, submit, and reconcile implementation.
- `src/server/adapters/solana-demo.ts` — offline candidate and execution adapters.
- `src/server/adapters/coingecko.ts` — market-data adapter.
- `src/server/adapters/deterministic-ranker.ts` — active staging ranking adapter; `zero-g.ts` remains isolated.
- `src/server/store.ts` and `postgres-store.ts` — in-memory and Postgres state adapters.
- `src/domain/policy.ts` — deterministic business rules.
- `src/domain/schemas.ts` — Solana-only runtime contracts.

More detail is in `docs/ARCHITECTURE.md` and `docs/USER_FLOW.md`.
