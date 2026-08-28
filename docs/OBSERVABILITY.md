# Observability runbook

This runbook configures the production monitoring baseline without sending request bodies, authentication material, wallet addresses, Privy identities, signed transactions, or financial preferences to telemetry vendors.

## System boundaries

- Vercel Web Analytics remains the anonymous traffic overview.
- Sentry `investmade-web` owns React errors, browser performance, and masked error replays.
- Sentry `investmade-api` owns Node/Express errors, request traces, provider failures, and operational alerts.
- Vercel Runtime Logs receive structured JSON with a random request ID, normalized route, status, and duration.
- Postgres remains the durable source of truth for execution and reconciliation state. Logs and Sentry are not a financial audit ledger.
- A separate Cloudflare Worker forwards only a generic alert notification to Telegram. It never forwards Sentry titles, stack traces, request URLs, or webhook payload details.

## 1. Create Sentry projects

Create one Sentry organization and two projects:

| Project | Platform | Purpose |
| --- | --- | --- |
| `investmade-web` | React | Browser errors, traces, masked replay |
| `investmade-api` | Node.js | API errors, traces, operational issues |

Copy each project's DSN. A DSN is an ingestion identifier, not an account-management token, but it must still be scoped to the correct environment.

Create an organization auth token for source-map uploads with only the project/release permissions required by Sentry's build plugin. Never expose this token through a `VITE_` variable or commit it to Git.

## 2. Configure Vercel

Add these variables to the Production environment:

| Variable | Value |
| --- | --- |
| `SENTRY_DSN` | DSN from `investmade-api` |
| `VITE_SENTRY_DSN` | DSN from `investmade-web` |
| `SENTRY_ENVIRONMENT` | `production` |
| `VITE_SENTRY_ENVIRONMENT` | `production` |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.05` |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | `0.05` |
| `VITE_SENTRY_REPLAY_SESSION_SAMPLE_RATE` | `0.01` |
| `VITE_SENTRY_REPLAY_ERROR_SAMPLE_RATE` | `1` |
| `SENTRY_ORG` | Sentry organization slug |
| `SENTRY_PROJECT_WEB` | `investmade-web` |
| `SENTRY_AUTH_TOKEN` | build-only organization token |

The frontend and backend automatically use `VERCEL_GIT_COMMIT_SHA` as their release when no explicit release is supplied. The Vite plugin generates hidden source maps only when all build-upload variables are present, uploads them to Sentry, and deletes the `.map` files before deployment.

Preview should use separate DSNs or `preview` environment values and must not page Telegram. Local development is disabled when the DSNs are absent.

## 3. Deploy the Telegram relay

The Telegram group ID is configuration, not source code. Store all three values as Cloudflare Worker secrets:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `SENTRY_WEBHOOK_SECRET`

Generate the webhook secret locally, for example with `openssl rand -hex 32`. Do not paste it into chat, a shell command argument, or Git.

From the repository root:

```bash
npx wrangler deploy --config workers/sentry-telegram/wrangler.toml
npx wrangler secret put TELEGRAM_BOT_TOKEN --config workers/sentry-telegram/wrangler.toml
npx wrangler secret put TELEGRAM_CHAT_ID --config workers/sentry-telegram/wrangler.toml
npx wrangler secret put SENTRY_WEBHOOK_SECRET --config workers/sentry-telegram/wrangler.toml
```

Enter each value only at Wrangler's hidden prompt. Cloudflare documents that Worker secrets are encrypted and hidden after creation. The free plan is sufficient for normal incident-alert volume.

## 4. Connect Sentry alerts to the relay

Create an internal Sentry integration that is allowed to receive alert webhooks. Configure:

- Webhook URL: the deployed Worker's URL.
- Custom header: `X-Investmade-Webhook-Secret: <same random secret>`.
- Projects: only `investmade-web` and `investmade-api`.
- Permissions: minimum required read/alert scopes; no organization administration.

Create production-only alert rules:

1. Immediate `CRITICAL`: new/regressed fatal or error issue on either project.
2. Immediate `CRITICAL`: `execution_broadcast_unknown`, `reconciliation_failed`, or readiness failure.
3. `WARNING`: `reconciliation_backlog` or sustained provider failures.
4. `WARNING`: API 5xx rate above 5% for five minutes, once traffic is sufficient for the sampled trace to be representative.
5. Daily digest: remaining unresolved issues. Do not send development or preview issues to Telegram.

The Worker deliberately sends only `CRITICAL/WARNING`, the fixed application component (`web`, `api`, or `application`), and an instruction to open Sentry. Detailed investigation stays inside the access-controlled Sentry organization.

## 5. Connect Sentry MCP to Codex

Use Sentry's official remote MCP endpoint:

```text
https://mcp.sentry.dev/mcp
```

In the ChatGPT desktop app, open **Settings → MCP servers → Add server**, choose **Streamable HTTP**, enter the URL, save, restart, and select **Authenticate**. The desktop app, Codex CLI, and IDE extension share MCP configuration on the same Codex host. Use `/mcp` to verify the connection.

Start with inspect/read access. The intended workflow is:

1. Codex reads an issue, trace, release, and redacted breadcrumbs.
2. Codex correlates `request_id`, normalized route, and release with repository code.
3. Codex prepares and tests a patch in a separate worktree.
4. A human reviews deployment and issue resolution. Do not grant automatic production deployment or organization administration.

References:

- [OpenAI documentation: connect Codex to MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [Official Sentry MCP server](https://github.com/getsentry/sentry-mcp)
- [Sentry structured log and event datasets](https://docs.sentry.io/api/explore/query-explore-events-in-table-format/)
- [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

## 6. Verification and incident response

After the first production deploy:

1. Confirm `/api/health` returns liveness and `/api/health/ready` returns `{ "status": "ready" }`.
2. Trigger Sentry's test error separately in preview for web and API. Confirm the correct release and readable source location.
3. Confirm events contain no request body, authorization/cookie headers, user object, wallet, Privy ID, or query string.
4. Trigger an alert-rule test and confirm Telegram receives only the generic notification.
5. Search Vercel logs by `requestId` and confirm it matches the `X-Request-Id` response header.
6. Confirm preview errors do not notify Telegram.

For a production incident:

1. Determine whether the scope is web, API, provider, database, or reconciliation.
2. For monetary operations, trust stored execution state plus chain confirmation, not HTTP success or Sentry status.
3. Treat unknown broadcast or reconciliation state as critical. Disable the relevant live feature flag before attempting manual repair.
4. Preserve the execution record and chain evidence. Never paste raw signed transactions, tokens, wallet mappings, or request bodies into Telegram or an issue comment.
5. Resolve the Sentry issue only after the fix is deployed and the production regression check passes.

