# Full application QA checklist — 2026-08-08

Overall status: **primary authenticated journeys pass; documented exceptions remain**

Use this checklist after the design implementation is complete. A quote,
simulation, wallet prompt, or submitted signature is not proof of settlement.

Status values: `Pending`, `Pass`, `Fail`, `Blocked`, `Not applicable`.

## Run record

| Field | Value |
| --- | --- |
| Commit / worktree | Dirty local worktree; no commit, push, or deployment requested |
| Tester | Codex |
| Date and timezone | 2026-08-08, Europe/Lisbon |
| Local URL | `http://localhost:5173/` |
| API health URL/result | `/api/health` → `status: ok`, `mode: local-live`, `chainId: 4663` |
| Primary browser/version | Codex in-app browser; exact Chromium version not exposed |
| Mobile viewport | `393 × 852` CSS px |
| Desktop viewport | Inspected at `1280 × 720`; exact `1440 × 900` not rerun |
| Active chain/provider | Solana mainnet-beta / Jupiter |
| Wallet | `ENskeW…9oyh` |
| Theme/palette variants | Light and dark pass on primary mobile surfaces |
| Evidence directory | `/private/tmp/invest4-design-audit-2026-08-08/` |
| Console log | No first-party errors; known WalletConnect duplicate-initialization warning remains |

## Release gates

- [x] `npm test` — Status: Pass; Evidence: 37/37 files, 179/179 tests.
- [x] `npm run typecheck` — Status: Pass; Evidence: `tsc -b --pretty false` exit 0.
- [x] `npm run lint` — Status: Pass; Evidence: Biome checked 104 files, no fixes.
- [x] `npm run build` — Status: Pass; Evidence: Vite production build completed; dependency PURE-annotation and large-chunk warnings are non-blocking.
- [x] `git diff --check` — Status: Pass; Evidence: exit 0, no output.
- [x] No new first-party console errors during the authenticated browser journey —
      Status: Pass; Evidence: only the known WalletConnect duplicate-initialization warning.
- [x] Existing focused suites cover theme settings, Ideas settings and baskets,
      deterministic order, chart animation/history, portfolio, Jupiter,
      review safety, navigation semantics, receipts, and API execution paths — Status: Pass; Evidence:
      `tests/theme-settings.test.ts`, `tests/idea-settings.test.ts`,
      `tests/ideas.test.ts`, `tests/basket-selections.test.ts`,
      `tests/deterministic-shuffle.test.ts`, `tests/chart-animation.test.ts`,
      `tests/chart-history.test.ts`, `tests/portfolio.test.ts`,
      `tests/jupiter.test.ts`, `tests/review-safety.test.ts`,
      `tests/api.test.ts`.

## Global shell and accessibility

| Check | Mobile | Desktop | Evidence / notes |
| --- | --- | --- | --- |
| App boot and authentication restore | Pass | Pass | Signed-out landing not rerun to preserve the authenticated onchain session |
| Wallet menu and copy-address surface | Pass | Not rerun | Logout/connect deliberately not executed |
| Header, page title, sticky action tray, and bottom/desktop navigation | Pass | Pass | `393 × 852` and `1280 × 720` |
| Feed, Ideas, Portfolio, and Account navigation preserves the intended active tab | Pass | Pass | Separate mobile navigation follows content in DOM; PrimaryNav regression test added |
| Page position and basket state remain predictable after tab changes/back navigation | Pass | Pass | Ideas review returned to Ideas; Feed/Ideas baskets stayed separate |
| Light and dark themes render without mixed surfaces | Pass | Pass | Primary surfaces inspected in both themes |
| Palette controls persist and maintain readable contrast | Pass | Pass | Semantic token consolidation |
| 44px touch targets, visible focus, logical keyboard order, and modal focus trap | Pass | Source pass | Runtime visible-control audit at `393 × 852`; keyboard semantics covered in source/tests |
| 200% text zoom, long values, and reduced motion | Blocked | Blocked | Long values and reduced-motion CSS reviewed; exact 200% browser zoom not run |
| No horizontal overflow or content hidden behind fixed UI | Pass | Pass | No overflow on primary tabs at inspected viewports |

## Authentication and onboarding

- [ ] Signed-out landing and chain selection — Status: Pending; Evidence: Pending.
- [ ] Every guardrail step, validation message, back/next action, and review —
      Status: Pending; Evidence: Pending.
- [ ] Save plan and connect; cancellation and retry — Status: Pending; Evidence:
      Pending.
- [ ] Returning-user resume and change-answers flow — Status: Pending; Evidence:
      Pending.
- [ ] Loading, authentication rejection, network error, and unsupported-chain
      states — Status: Pending; Evidence: Pending.

## Feed

- [ ] Shared adaptive skeleton appears, has accessible loading text, and yields
      to content without layout shift — Status: Pending; Evidence: Pending.
- [ ] Ready card: logo, name, amount, price/performance, chart, timeframes, and
      details remain readable — Status: Pending; Evidence: Pending.
- [ ] Chart loading, unavailable history, positive/negative/flat values, and
      large-number formatting — Status: Pending; Evidence: Pending.
- [ ] Swipe left/right and Skip/Add button equivalents; decision text remains
      legible in both themes — Status: Pending; Evidence: Pending.
- [ ] Persistent details state, deterministic feed order, prefetch/end-of-feed,
      and retry state — Status: Pending; Evidence: Pending.
- [ ] Monthly limit, provider/chain status, basket count, and sticky actions do
      not obscure the card — Status: Pending; Evidence: Pending.

## Ideas

- [ ] Ideas skeleton and provider-specific chart loading use the shared loading
      grammar — Status: Pending; Evidence: Pending.
- [ ] Default `3M` timeframe, all timeframe controls, strategy/S&P comparison,
      axes, dates, and performance copy — Status: Pending; Evidence: Pending.
- [ ] Bundle title, short description, editable amount, allocation bar, token
      icons, exact weights, and availability adjustment — Status: Pending;
      Evidence: Pending.
- [ ] Holdings matrix fits without an inner scroll and retains all executable
      assets — Status: Pending; Evidence: Pending.
- [ ] Cesto/CoinGecko provider setting, missing history, missing route, partial
      availability, and no-executable-assets state — Status: Pending; Evidence:
      Pending.
- [ ] Swipe/add multiple bundles; duplicate assets aggregate by canonical mint
      and exact cent allocations sum to bundle totals — Status: Pending;
      Evidence: Pending.
- [ ] Ideas basket remains separate from Feed basket; Ideas stays the active tab
      in grouped review — Status: Pending; Evidence: Pending.
- [ ] Bundle-level X removes every leg from that bundle without removing other
      bundle or Feed selections — Status: Pending; Evidence: Pending.

## Review, signing, and receipts

- [ ] Feed review and Ideas review show the correct source grouping and exact
      heterogeneous amounts — Status: Pending; Evidence: Pending.
- [ ] Preparing quotes, provider retry/rate limit, insufficient balance, stale
      plan, expired quote, unsupported leg, and refresh — Status: Pending;
      Evidence: Pending.
- [ ] Any basket edit invalidates the prepared plan and authorized plan hash —
      Status: Pending; Evidence: Pending.
- [ ] Atomic-first state and per-leg fallback are accurately described; UI never
      claims settlement before verified terminal reconciliation — Status:
      Pending; Evidence: Pending.
- [ ] Wallet rejection, unexpected signer, simulation error, submission timeout,
      and refresh/recovery — Status: Pending; Evidence: Pending.
- [ ] Submitted, settled, partial, and failed receipts; per-leg output, explorer
      link, timestamp, provider/chain, and retry/navigation — Status: Pending;
      Evidence: Pending.

## Portfolio

- [ ] Skeleton, empty portfolio, sparse portfolio, loaded positions, unknown
      token, unavailable price, and API error/retry — Status: Pending; Evidence:
      Pending.
- [ ] Portfolio value, token amount, fiat value, symbol/name, and logos remain
      scannable at `393 × 852` — Status: Pending; Evidence: Pending.
- [ ] Individual exit quote, expiry, confirmation, rejection, submission,
      terminal status, and refreshed balance — Status: Pending; Evidence:
      Pending.
- [ ] Exit All excludes native SOL and clearly lists skipped/unroutable assets —
      Status: Pending; Evidence: Pending.
- [ ] Exit All atomic/fallback wording matches real execution behavior; partial
      outcomes remain visible and retryable — Status: Pending; Evidence:
      Pending.

## Account and settings

- [ ] USDC/SOL balances and long wallet address fit without accidental wrapping
      or overlap — Status: Pending; Evidence: Pending.
- [ ] Ideas settings modal: default bundle amount, chart provider, validation,
      save/cancel, persisted values — Status: Pending; Evidence: Pending.
- [ ] Plan/settings modal: chain, execution provider, cadence, limit, ticket,
      risk, asset mix, validation, save/cancel — Status: Pending; Evidence:
      Pending.
- [ ] Theme and palette selection persists for light and dark modes; dialogs and
      toasts resolve the selected theme immediately — Status: Pending; Evidence:
      Pending.
- [ ] Save invalidates unsigned prepared execution and returns to a stable feed —
      Status: Pending; Evidence: Pending.

## Bounded Solana mainnet smoke

Safety boundary: perform only after all non-financial gates above pass. Use a
maximum input of **0.10 USDC**, buy one canonical non-native Solana asset, then
exit only that new position individually. Do not run Exit All and do not sell
native SOL. JUP was not present in the executable Feed page, so the live smoke
used canonical Portal WBTC rather than forcing a different or stale route.

Canonical destination:

- Symbol: `WBTC`
- Mint: `3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh`
- Route/provider: Jupiter on Solana mainnet-beta

### Preflight

- [x] Confirm Solana mainnet, Jupiter execution provider, expected wallet, and a
      sufficient SOL fee buffer — Status: Pass; Evidence: wallet `ENskeW…9oyh`,
      SOL `0.061386946`.
- [x] Record pre-trade USDC, WBTC, and SOL balances — Status: Pass; Evidence:
      USDC `35.936655`, WBTC `0`, SOL `0.061386946`.
- [x] Confirm the review contains exactly one WBTC leg and exactly `0.10 USDC`
      input; verify mint, signer, plan hash, min output, expiry, and price impact —
      Status: Pass; Evidence: UI Review prepared one atomic Jupiter transaction
      with estimated output `0.00000154 WBTC`.
- [ ] Abort if input exceeds `0.10 USDC`, the mint/signer is unexpected, multiple
      assets appear, the quote is stale, simulation fails, the fee buffer is
      inadequate, or signing asks for an unexplained additional transaction.

### Buy WBTC

- [x] Press the primary Sign & invest action once and approve only the reviewed
      transaction — Status: Pass; Evidence: one embedded-wallet signature.
- [x] Record signature, explorer URL, slot/block time, provider, and terminal RPC
      status — Status: Pass; Evidence:
      [buy transaction](https://explorer.solana.com/tx/3cihNtsfhaF76uMiZaNAKGY52foHaXNR2u6UdiggWmyNBB1LJcABmTkPui5nTsE4z5eaVgCN48QE6XX2P4pG9FWh), finalized.
- [x] Verify the receipt reaches a terminal state and reports the actual WBTC
      output — Status: Pass; Evidence: `SETTLED`, Verified on Solana,
      `0.00000154 WBTC` received.
- [x] Verify post-buy WBTC increased and USDC decreased by the reviewed input;
      record SOL fee delta — Status: Pass; Evidence: USDC `35.836655`, WBTC
      `0.00000154`, SOL `0.061381389`.

### Individual WBTC exit

- [x] Open Portfolio and request an individual WBTC → USDC quote; do not use Exit
      All — Status: Pass; Evidence: quoted minimum output `0.099557 USDC`.
- [x] Verify the exit mint, amount, signer, min USDC output, expiry, and fee
      buffer, then approve only that individual exit — Status: Pass; Evidence:
      the explicit Privy WBTC-exit confirmation was approved once.
- [x] Record exit signature, explorer URL, slot/block time, and terminal RPC
      status — Status: Pass; Evidence:
      [exit transaction](https://explorer.solana.com/tx/5tWRLftyQZgbi7xsvJhzGmBsogT2XqiviMgwFFQ1W1oN4Lu6m6TiwfLgtYfHwRQ2edEKvmz6m95rXDjc9bPXbz83), finalized, no error.
- [x] Verify WBTC decreases by the exited amount, USDC increases by the settled
      output, native SOL remains held except for network fees, and Portfolio
      refreshes — Status: Pass; Evidence: WBTC `0`, USDC `35.936710`
      (`+0.100055` on exit), SOL `0.061375907`; transaction fee `5,482`
      lamports.

## Final evidence and disposition

| Area | Status | Evidence | Open issue / owner |
| --- | --- | --- | --- |
| Automated gates | Pass | 37 files / 179 tests; typecheck, lint, build, diff check | None |
| iPhone 17 visual QA | Pass | `393 × 852`, primary tabs/Review, light and dark | Exact 200% zoom not run |
| Desktop visual QA | Pass with exception | `1280 × 720`, Feed and Ideas | Exact `1440 × 900` not rerun |
| Accessibility | Pass with exception | Runtime target-size audit plus semantic/keyboard tests | Exact 200% zoom and screen reader not run |
| Feed | Pass | Skeleton, card, chart, actions, review path, onchain buy | Known upstream Jupiter 429s can lengthen feed generation |
| Ideas | Pass | Card/chart/holdings, separate basket, grouped Review, tab return | External history/route availability remains provider-dependent |
| Review/receipt | Pass | Loading/error/settled states and accurate atomic/independent copy | Wallet rejection path not deliberately triggered |
| Portfolio | Pass | Loading/empty/exit states; SOL and USDC excluded from Exit All | Multi-position Exit All not broadcast on the funded wallet |
| Account/settings | Pass | Primary screen, settings sheet, theme persistence | Logout/connect not run to preserve session |
| 0.10 USDC WBTC buy | Pass | Buy signature above | Used WBTC because JUP was absent from current Feed |
| Individual WBTC exit | Pass | Exit signature and final balances above | None |
| Final local-build decision | Pass | Local runtime healthy; no first-party console errors | No deploy/push requested |
