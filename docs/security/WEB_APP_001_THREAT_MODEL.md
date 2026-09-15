# App Banzami Web — threat model (WEB-APP-001 §147)

Version: 1.0. The Web-specific threats and the controls in place. The app is a
financial application; the marketing-site posture does not apply. The Web client
is the shared Flutter app compiled to the Web target (CanvasKit), served behind a
same-origin Node session BFF (`apps/app-banzami`).

| Threat | Control |
|--------|---------|
| **Credential theft** (Bearer in the browser) | The Consumer Bearer never reaches the browser. It is AES-256-GCM-encrypted in an HttpOnly, `SameSite=Lax`, `Secure` (prod) session cookie, opened only server-side, and **stripped from the auth response** — the browser receives a worthless sentinel in its place. `WEB_CONSUMER_BEARER_VISIBLE_TO_JS=0`, `WEB_FINANCIAL_AUTH_LOCAL_STORAGE=0`. Verified in-browser: no JWT-shaped value in `localStorage`, `sessionStorage` or `document.cookie`; the session cookie is not JS-readable. |
| **CSRF** on state-changing calls | Double-submit token bound to the encrypted session; every BFF write requires `X-CSRF-Token` matching the session's secret (timing-safe, non-empty). A pre-auth nonce is seeded on the app shell so the first write (register/login) is already bound. GETs need none. |
| **Session fixation** | A fresh session is minted on every sign-in/registration; the pre-auth cookie never becomes the authenticated one. |
| **XSS** | The UI is Flutter rendered to a **canvas** (CanvasKit): consumer-controlled strings — display name, handle, note, counterparty — are painted as text, not inserted into the DOM, so there is no HTML/attribute injection sink. CSP `script-src 'self' 'wasm-unsafe-eval'` (WASM for CanvasKit; no third-party script origin, no inline `<script>` beyond the same-origin bootstrap), `object-src 'none'`, `base-uri 'self'`. `WEB_XSS_PATHS=0`. |
| **Clickjacking / untrusted framing** | CSP `frame-ancestors 'self' https://banzami.com https://www.banzami.com` — only the marketing origins may frame the app; `frame-src 'none'`; `object-src 'none'`. |
| **Cross-origin messaging** | Not used for credentials/state; the homepage portal opens the app same-site. Any future postMessage validates origin/type and never carries session, OTP, balance or token. |
| **IDOR** | The BFF derives the actor from the session; every Consumer call is scoped by the session Bearer. No client-supplied consumer/wallet id selects another user's resource. Receipts render from the actor's own activity. |
| **QR substitution** | The receive QR encodes only the canonical `banzami-sandbox:@handle`; resolution is server-side against the Consumer API. |
| **Registration abuse** | The Consumer API enforces the primary registration/login limits; the BFF adds a sliding-window per-IP cap on the auth-issuance routes (defence-in-depth). One ledger-backed grant per consumer; login/registration retries never mint a second grant. |
| **Realtime leakage** | The Web client only reads its own balance/activity through session-scoped BFF routes; no cross-user subscription. |
| **Private state in shared caches** | Authenticated shells and API responses are `no-store`; the app default is `no-store`. |
| **Analytics leakage** | No marketing analytics in the app plane; balances/amounts/counterparties/receipts/session identifiers are never sent to telemetry. |
| **Offline replay / private cache** | Flutter ships an asset-caching service worker (`flutter_service_worker.js`) scoped to the app's own static resources (shell, `main.dart.js`, CanvasKit, fonts — none of them user data). It does not intercept or cache `/consumer/*`: those are `no-store` XHRs outside its resource list, so no authenticated financial data is cached and no POST is queued or replayed. `OFFLINE_FINANCIAL_MUTATION_REPLAY=0`, `WEB_PRIVATE_FINANCIAL_CACHE_LEAKAGE=0`. |
| **Back-button resurrection** | Logout clears the session cookie (and CSRF mirror) and the backend token is revoked; because the browser never held a Bearer, a back/forward-cached page has no reusable credential — the first Consumer call 401s and returns to Welcome. |
| **Transport** | HSTS (`max-age` + preload); TLS floor enforced at the Cloudflare zone; app served only over HTTPS. |

## Environment safety

All value is fictitious; Financial Live is fail-closed. Sandbox balances cannot
become Live balances. `SANDBOX_LIVE_CONSUMER_BALANCE_CROSSOVER=0`. Sandbox
acceptance does not certify the app for Financial Live — that requires a
dedicated Live security/regulatory gate.
