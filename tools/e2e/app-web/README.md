# App Banzami Web — browser E2E runner (WEB-E2E-RUNNER-001)

A real Playwright/Chromium runner that drives the **App Banzami Web** consumer
app (`app.banzami.com`, Flutter compiled to web) through its **accessibility
Semantics tree** — not screen coordinates — against the **public Sandbox hosts**.
It proves the consumer surface the way a person uses it (register, PIN, Home,
P2P, pay a Payment Link by its deep link) and closes the generic
Developer → Consumer cleanroom end-to-end, then cleans up and verifies residue
and economic integrity.

Nothing here bypasses the product: no API substitution for a payment, no session
injection, no OTP peek (consumer registration needs no OTP), no test-only
financial control, no founder credentials, no DOA/founder special case.

## Reproducible browser

The runner does **not** assume a machine-local Chromium. It resolves one in this
order and prints which it used (`BROWSER_EXECUTABLE_REPORTED`,
`BROWSER_RUNNER_MACHINE_CACHE_ASSUMPTION=0`):

1. **Normal path** — the pinned Playwright dependency's own Chromium
   (`playwright@1.49.1` → Chromium 131). Install it once:

   ```bash
   cd tools/e2e/app-web
   npm ci            # or: npm install
   npx playwright install chromium
   ```

2. **Fallback** — if that build is missing or broken (an interrupted download can
   leave a stub with no Framework, or on Apple Silicon an unsigned binary the
   kernel refuses with errno 88), the runner DISCOVERS a complete, signed
   Chromium already in the Playwright cache and uses it. Discovery is dynamic —
   there is no hardcoded path.

Diagnose the browser without running any test:

```bash
node lib/browser.mjs --diagnose
# or: npm run browser:check
```

### CI bootstrap

```bash
cd tools/e2e/app-web
npm ci
npx playwright install --with-deps chromium   # --with-deps on Linux CI
node lib/browser.mjs --diagnose               # asserts BROWSER_EXECUTABLE_REPORTED=PASS
node run-all.mjs
```

CI needs SSH access to the Sandbox host (`root@217.160.9.248`, override with
`BZ_SANDBOX_HOST`) for the read-only ledger/residue evidence and the canonical
consumer retirement, and outbound HTTPS to `*.banzami.com`.

## How Flutter web is driven (semantics-first)

Flutter CanvasKit paints to a canvas and exposes no ordinary DOM for its widgets.
All of the Flutter-specific mechanics live in one place —
[`lib/semantics-driver.mjs`](lib/semantics-driver.mjs) — so page objects never
re-derive them (`FLUTTER_TEXT_FIELD_AUTOMATION_HELPER=ONE`):

- **Enable semantics** (`FLUTTER_SEMANTICS_ACTIVATION`): Flutter mounts a hidden
  `flt-semantics-placeholder[aria-label="Enable accessibility"]` OUTSIDE the
  viewport; we activate it with a dispatched click, then confirm real
  `flt-semantics` nodes appeared (the empty `flt-semantics-host` alone is not
  enough). Idempotent; throws rather than silently falling back to coordinates.
- **Buttons**: `getByRole('button', { name })` — Flutter web synthesises a button
  role from a tap handler, so text-bearing controls resolve by their label.
- **Text fields**: the semantics `<input>` is a DISABLED screen-reader proxy; the
  real editable is a separate input Flutter focuses only after a pointer
  activation. `fillFieldBySemantics(label, value)` derives the field's box from
  its semantics node (semantics-anchored, **no fixed coordinates** —
  `CANONICAL_E2E_FIXED_COORDINATE_ACTIONS=0`), taps it, types real key events, and
  verifies the value registered in Flutter state.

Page objects: [`pages/`](pages) (Welcome, CreateAccount, Pin, Home, Send,
PaymentRequest, Receipt). Financial assertions are kept out of the UI mechanics —
balances and integrity come from a read-only ledger read
([`lib/operator-read.mjs`](lib/operator-read.mjs)), never from screenshots alone.

## Run it

```bash
# the canonical command (also: make app-web-cleanroom from the repo root)
node run-all.mjs
node run-all.mjs --quick     # a single cleanroom run instead of two

# individual proofs
npm run smoke:register       # proofs/01 registration → PIN → Home
npm run smoke:p2p            # proofs/02 Web→Web P2P
node proofs/03-invalid-deeplink.mjs
node proofs/04-deeplink-resume-pay.mjs

# the generic cleanroom, once
node app-web-cleanroom.mjs --label run1

# console UI evidence + regressions
node console-ui-evidence.mjs
node regressions.mjs
```

Evidence JSON is written under the assurance directory
(`banzami-assurance/<deploy>/app-web/`); nothing secret is ever printed or
stored (`E2E_SECRET_EVIDENCE_LEAKAGE=0` — the PIN is generated per run in memory
and never logged, and the reporter scrubs credential-shaped values).

## Accessibility

Driving through Semantics is also a product-accessibility audit. Critical
consumer controls that lacked semantic identity were fixed in the shared Flutter
widgets (not special-cased in the runner) — PIN keypad, Send recipient/amount
fields, login field, Home actions, sandbox steppers, receipt close — so screen
readers reach them too (`CRITICAL_CONSUMER_CONTROLS_HAVE_SEMANTICS`).

## Cleanup & integrity

Every run retires what it created through the canonical lifecycle — the workspace
Delete revokes keys and retires project resources; each consumer is retired with
the same Core postings the residue tool uses (`retire-funds` then `suspend`, a
balanced posting, no SQL). Afterwards the runner measures, read-only:
workspace residue = 0, the consumer residue scanner is green, and the ledger is
balanced with no unbacked liability and no duplicate/orphan legs.
