# Privy production security gate

Do not switch the Privy app from test to production until every dashboard item below is confirmed.

## Enforced in this repository

- CSP is returned by Vite, Vercel, and Express. It blocks framing with `frame-ancestors 'none'` and permits only the Privy, WalletConnect, Solana, Blink, CAPTCHA, analytics, and image resources used by the app.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: strict-origin-when-cross-origin` are returned by the web app.
- API access is same-origin; no permissive CORS middleware is enabled.
- Privy credentials are server environment variables. The client receives only the public app ID from `/api/config`.
- The API verifies Privy access tokens and confirms the requested execution wallet is linked to the authenticated Privy user.
- API rate limiting and structured wallet authorization failure logs are enabled.

## Privy Dashboard confirmation required

- Create/use separate production Privy credentials; do not reuse test credentials.
- The current live routing redirects `https://invest4.fun` to `https://www.invest4.fun`. Allow `https://www.invest4.fun` on the production Privy app client; add the apex origin only if routing changes and the app actually runs there. Do not allow localhost on the production app client.
- Verify ownership of the production domain and enable HttpOnly authentication cookies.
- Require MFA with a passkey or authenticator for email-login accounts before they can control material wallet value; keep SMS login disabled.
- Choose and document the production session duration and embedded-wallet recovery method.
- Enable activity monitoring and alerts, then review Privy activity logs after the first production logins.

After any Privy SDK upgrade, rerun the security-header test and manually test email login, embedded-wallet creation, Phantom/Backpack linking, Blink top-up, logout, and a reviewed transaction under the enforced CSP.

## Deployment gate

As of the pre-production audit on 2026-08-11, the live `https://www.invest4.fun` response did not include CSP or `X-Frame-Options`. Deploy this repository change and verify the live response contains both `Content-Security-Policy` with `frame-ancestors 'none'` and `X-Frame-Options: DENY` before checking Privy's security boxes or switching modes.
