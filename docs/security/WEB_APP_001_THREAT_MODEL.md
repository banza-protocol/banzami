# App Banzami Web — threat model (WEB-APP-001 §147)

Version: 1.0. The Web-specific threats and the controls in place. The app is a
financial application; the marketing-site posture does not apply.

| Threat | Control |
|--------|---------|
| **Credential theft** (Bearer in the browser) | The Consumer Bearer never reaches the browser. It is AES-256-GCM-encrypted in an HttpOnly, `SameSite=Lax`, `Secure` (prod) session cookie, opened only server-side. `WEB_FINANCIAL_AUTH_LOCAL_STORAGE=0`. |
| **CSRF** on state-changing calls | Double-submit token bound to the encrypted session; every BFF write requires `X-CSRF-Token` matching the session's secret (timing-safe). GETs need none. |
| **Session fixation** | A fresh session is minted on every sign-in/registration; the pre-auth cookie never becomes the authenticated one. |
| **XSS** | Per-request CSP with a nonce (`strict-dynamic`), no inline script, no `eval` in production; React escaping; no `dangerouslySetInnerHTML` on user data. Display name / handle / note / counterparty render as text. |
| **Clickjacking / untrusted framing** | CSP `frame-ancestors 'self' https://banzami.com https://www.banzami.com` — only the marketing origins may frame the app; `frame-src 'none'`; `object-src 'none'`. |
| **Cross-origin messaging** | Not used for credentials/state; the homepage portal opens the app same-site. Any future postMessage validates origin/type and never carries session, OTP, balance or token. |
| **IDOR** | The BFF derives the actor from the session; every Consumer call is scoped by the session Bearer. No client-supplied consumer/wallet id selects another user's resource. Receipts render from the actor's own activity. |
| **QR substitution** | The receive QR encodes only the canonical `banzami-sandbox:@handle`; resolution is server-side against the Consumer API. |
| **Registration abuse** | Public registration is rate-limited per IP at the BFF (defence-in-depth) on top of the backend limits; one ledger-backed grant per consumer. |
| **Realtime leakage** | The Web client only reads its own balance/activity through session-scoped BFF routes; no cross-user subscription. |
| **Private state in shared caches** | Authenticated shells and API responses are `no-store`; the app default is `no-store`. |
| **Analytics leakage** | No marketing analytics in the app plane; balances/amounts/counterparties/receipts/session identifiers are never sent to telemetry. |
| **Offline replay** | No service worker replays financial POSTs; this milestone implements no offline execution. |
| **Back-button resurrection** | Logout replaces history and hard-navigates; the session cookie (and CSRF mirror) are cleared and the backend token best-effort revoked. |
| **Transport** | HSTS (`max-age` + preload); TLS floor enforced at the Cloudflare zone; app served only over HTTPS. |

## Environment safety

All value is fictitious; Financial Live is fail-closed. Sandbox balances cannot
become Live balances. `SANDBOX_LIVE_CONSUMER_BALANCE_CROSSOVER=0`. Sandbox
acceptance does not certify the app for Financial Live — that requires a
dedicated Live security/regulatory gate.
