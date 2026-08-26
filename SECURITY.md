# Security policy

## Supported configuration

Only the latest `main` revision is supported. Production must run with `INVESTMADE_DEMO_MODE=false`, HTTPS, a private database, dedicated RPC, and secrets supplied by the deployment platform.

## Non-custodial boundary

investmade.fun has no server signing key and cannot broadcast a buy on behalf of a user.

Privy access tokens are verified by the backend for live requests, and the requested Solana address
must be present in the authenticated user's verified linked accounts. `PRIVY_APP_SECRET` and all
provider credentials are server-only deployment secrets.

## Required controls

- Keep `.env`, `.env.local`, API keys, and database credentials outside Git.
- Rotate any credential accidentally printed, committed, or shared through an insecure channel.
- Terminate TLS at the ingress and preserve secure, `SameSite=Strict`, HTTP-only cookies.
- Restrict database and RPC network access.
- Run `npm audit --omit=dev`, the full CI suite, and the production checklist before release.
- Do not log request bodies for auth, 0G, or execution routes.
- Never reuse a signed Solana transaction after its blockhash or quote expires.
- Keep cards disabled unless the canonical mint, policy checks, and an exact-size route pass.
- Treat the current atomic buy as all-or-nothing. Preserve `PARTIAL` only for legacy/non-atomic records and never relabel `PARTIAL` or `FAILED` as settled.
- Treat “Exit all” as sequential wallet execution, not an atomic basket; stop and report honestly after the first failed call.

## Reporting

Do not open a public issue for a vulnerability involving funds, authentication, secrets, or private user data. Contact the repository owner privately with reproduction steps and impact.
