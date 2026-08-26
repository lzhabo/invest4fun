# Product design audit — 2026-08-08

Status: **implemented and locally verified; exceptions are recorded below**

This audit records the mobile-first baseline and the acceptance target for the
current invest4.fun application. It does not replace or revise the historical
evidence in `design-qa.md`.

## Scope and evidence

- Primary viewport: iPhone 17, `393 × 852` CSS pixels.
- Secondary viewport: desktop, `1440 × 900` CSS pixels.
- Product surfaces: authentication and onboarding, Feed, Ideas, Portfolio,
  Account, Review, submitted/terminal receipts, settings, loaders, empty/error
  states, wallet menus, sticky actions, and primary navigation.
- Baseline captures:
  - `/private/tmp/invest4-design-audit-2026-08-08/01-current-mobile.png`
  - `/private/tmp/invest4-design-audit-2026-08-08/02-current-ideas-mobile.png`
  - `/private/tmp/invest4-design-audit-2026-08-08/03-current-portfolio-mobile.png`
  - `/private/tmp/invest4-design-audit-2026-08-08/04-current-account-mobile.png`
- Historical component-level visual evidence remains in `design-qa.md`.

## Baseline findings

| Priority | Surface | Finding | Acceptance target | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| P1 | Ideas | The light card and controls can render against a dark page with dark page copy, creating an unreadable mixed-theme state. | Page, card, sticky actions, navigation, and text use one resolved theme and semantic palette. | Pass | Mobile light/dark browser pass at `393 × 852` |
| P1 | Mobile actions | Sticky review/actions and the bottom navigation consume a large part of the viewport and can obscure card composition or page content. | All meaningful content remains reachable; safe-area padding and scroll clearance prevent overlap. | Pass | Feed, Ideas, Review, Portfolio, and Account browser pass |
| P2 | Typography | Secondary labels, chart annotations, holdings, and portfolio metadata are inconsistently small while Account headings and balances are oversized. | A consistent type scale preserves hierarchy without wrapping critical values or dropping below the metadata minimum. | Pass | Shared typography tokens and mobile browser pass |
| P2 | Spacing | Page gutters, section gaps, card padding, table density, and fixed-footer spacing vary by surface. | Shared spacing tokens control shell, cards, rows, controls, and sticky regions. | Pass | Shared spacing/control/radius tokens |
| P2 | Portfolio | Position rows are dense, unknown/unpriced states repeat copy, and sparse portfolios leave a visually unfinished page. | Rows remain scannable, unavailable data is concise, and empty space has an intentional responsive layout. | Pass | Empty state, loading skeleton, compact rows, and funding-USDC exclusion |
| P2 | Account | The long USDC balance wraps, section hierarchy mixes several display scales, and bottom navigation can overlay the last settings rows. | Values fit or scale safely; sections share one card/heading rhythm; last content clears navigation. | Pass | `393 × 852` light/dark and `<=360px` reflow rules |
| P2 | Global states | Loaders and completed screens have evolved independently, which risks inconsistent surfaces, motion, and status hierarchy. | Every route uses the shared semantic palette, skeleton language, status copy, and motion rules. | Pass | Shared page/card skeletons, status tokens, and reduced-motion rules |

No P0–P2 design finding remains open in the inspected primary journeys. Exact
`1440 × 900`, 200% text zoom, and signed-out onboarding were not rerun in the
final authenticated session and remain explicit QA exceptions rather than
assumed passes.

## Reference takeaways

The references are used for interaction and hierarchy patterns, not for copying
brand assets or layouts.

| Reference | Patterns to carry forward |
| --- | --- |
| [Tab Markets](https://tab.markets/) and [login](https://tab.markets/login) | Clear mobile gutters, restrained color, editorial display accents, strong primary CTA hierarchy, and generous separation between decisions. |
| [Dreamcash](https://dreamcash.xyz/) | Bold hierarchy, compact but consistent trading controls, and a dark product surface that remains readable under dense data. |
| [pump.fun](https://pump.fun/) | Focused onboarding modal, concise supporting copy, full-width primary action, and muted legal/secondary information. |
| [pools.trade](https://pools.trade/) | Structured dark cards, consistent radii and control heights, compact token rows, and one bright actionable accent. |
| [Uniswap app](https://app.uniswap.org/) | One clear primary task, low-noise surfaces, predictable field grouping, and subtle borders instead of excess decoration. |

## Shared visual system target

### Color and themes

- Use semantic tokens (`canvas`, `surface`, `surface-raised`, `ink`,
  `ink-muted`, `line`, `accent`, `success`, `danger`, `warning`) rather than
  component-local colors.
- Light mode follows a clean Robinhood-like hierarchy: pale neutral canvas,
  white raised surfaces, near-black text, and a high-contrast lime action.
- Dark mode follows a Solana-like hierarchy: near-black canvas, visibly raised
  neutral surfaces, off-white text, and mint/green action.
- Success, loss, warning, selection, and disabled states remain distinct in
  both themes. Color is never the only indicator.

### Typography

- UI/body family: DM Sans. Editorial display use is limited to named product or
  idea moments; functional headings and data stay in the UI family.
- Mobile target scale: page title `32/36`, section title `24/30`, card title
  `22/28`, body/control `16/24`, secondary `14/20`, metadata `12/16`.
- Critical balances, amounts, symbols, percentages, and error text must not be
  clipped or made unreadable to preserve a decorative scale.
- Numeric columns use tabular figures where alignment matters.

### Spacing, shape, and controls

- Base spacing scale: `4, 8, 12, 16, 20, 24, 32` pixels.
- Mobile page gutter: `16px`; compact card padding: `16px`; major sections use
  `24–32px` separation.
- Interactive target: at least `44 × 44px`; primary controls target `48–52px`
  height.
- Use one radius family: fields/compact controls `12px`, cards/modals `16px`,
  pills fully rounded.
- Borders remain subtle and consistent. Shadows communicate elevation only.

### Motion and feedback

- Reuse the current skeleton palette and loading grammar across all routes.
- Decision, loading, and modal motion must not block input or shift layout.
- Respect `prefers-reduced-motion`; preserve state meaning when animation is
  removed.
- Swipe outcomes, quote state, validation, and transaction state use visible
  text plus iconography.

## iPhone 17 acceptance criteria

- [x] No horizontal document overflow at `393 × 852`.
- [x] Header, primary action tray, and bottom navigation respect top/bottom safe
      areas and never cover actionable or required content.
- [x] The last item on every inspected scrollable screen can be moved above the bottom
      navigation/action tray.
- [x] No required information is trapped in nested scrolling on a card.
- [x] Primary actions and navigation targets are at least `44 × 44px`.
- [x] Body and control copy follows the consolidated responsive type scale; secondary copy is at least
      `14px`; metadata is at least `12px` with adequate line height.
- [x] Inspected text and semantic status tokens meet WCAG AA targets, and
      non-text controls/focus indicators meet `3:1`.
- [x] Amounts, addresses, token symbols, weights, dates, errors, and transaction
      hashes wrap or truncate deliberately without overlapping adjacent UI.
- [x] Light and dark themes have no mixed-theme surfaces or invisible labels.
- [x] Keyboard focus is visible; custom selects and modal controls have explicit keyboard semantics.
- [x] Loading, empty, error, disabled, submitted, partial, settled, and failed
      states are distinguishable without relying on color alone.
- [ ] Layout remains readable at 200% text zoom and with reduced motion enabled.

## Completion record

| Field | Value |
| --- | --- |
| Design implementation | Complete |
| Mobile visual QA | Pass at `393 × 852`, Feed/Ideas/Portfolio/Account/Review, light and dark |
| Desktop visual QA | Pass at inspected `1280 × 720`; exact `1440 × 900` not rerun |
| Accessibility QA | Pass for visible target sizes, focus, semantics, and keyboard-source checks; 200% zoom not rerun |
| Automated gates | Pass: 37 files / 179 tests, typecheck, lint, build, diff check |
| On-chain smoke | Pass: `0.10 USDC` WBTC atomic buy and individual Jupiter exit |
| Final evidence directory | `/private/tmp/invest4-design-audit-2026-08-08/` |
| Reviewer/date | Codex / 2026-08-08 Europe/Lisbon |
