# 21 — Owner decisions and open questions

Version: 1.0
Status: **awaiting owner review.** Phase B does not begin until D1 is decided.

---

## D1 · ⚠ BLOCKING · The irreversible Sandbox volume budget

**The problem** ([19](19-gap-contradiction-report.md) VL-001,
[16](16-external-dependency-matrix.md) §3). `aggregate_volume_minor` sums
merchant credits only, so it is monotonic — retiring funds does not reduce it.
It stands at **46.5 % of the Kz 2 000 000 lifetime cap**, with roughly 3.4 heavy
harness days of headroom. At 100 %, merchant payments fail permanently for
everyone, including real self-service developers and DOA.

These are operator-local pilot limits (ADR-048: Sandbox-only, config-gated,
never Live), so any change needs **no BANZA ADR**.

| Option | Change | Pros | Cons |
|---|---|---|---|
| **A · rolling window** (recommended) | count volume over a trailing window (e.g. 30 days) instead of all time | matches what "controlled pilot" appears to mean; still bounds abuse; self-healing; one SQL predicate | changes a stated V1.0 pilot control |
| **B · exclude validation actors** | omit Validation Actor wallets from the aggregate counters | preserves the limit for real users exactly | actors stop being fully ordinary in *one* policy dimension; needs a clean, auditable definition |
| **C · net volume** | count credits minus retirement debits | keeps a lifetime cap, makes retirement meaningful | "volume" then no longer means volume |
| **D · raise the cap** | larger constant | smallest change | postpones the problem; does not remove it |
| **E · accept and periodically rebuild** | let it fill, rebuild the Sandbox | no code change | destroys financial history — contradicts §23/§97 |

**Recommendation: A**, optionally with B for the actors. A keeps the control
real, keeps actors ordinary, and makes the Sandbox sustainable. E should be
rejected outright: it deletes the economic history the whole design protects.

**Please decide before Phase B.**

---

## D2 · Historical residue

1 158 terminally suspended merchants, 838 archived/deleted projects, ~785
synthetic consumers (VL-002). Retirement is an owner-approved operation; the
Lab will not delete on its own initiative.

- **(a)** retire synthetic residue now, before actors are provisioned
  *(recommended — it also frees `aggregate_funds`)*;
- **(b)** leave it and start clean-forward;
- **(c)** retire in stages during Phase D.

Ledger history stays either way. Only *value in circulation* is retired, by
reverse posting.

---

## D3 · Mail domain — confirm we do **not** provision one

The prompt proposed `@e2e.banzami.com` with catch-all mailboxes. The audit found
the platform already has both mechanisms
([06](06-auth-email-automation.md)):

- `@banzami-e2e.test` fixture identities — no email sent at all, budget-limited,
  audited as `session.fixture_minted`;
- real OTP read back through the **Resend sent-message API** using the existing
  docker secret — a genuine email proof with no inbox.

**Recommendation: do not provision `e2e.banzami.com`.** Confirm, or say what the
new domain would buy that these two do not.

---

## D4 · SDK publication without a human

The workflow already exists, already requests OIDC, already fail-closes, and
says so in its own header. What is missing is the registry-side configuration.

**Recommendation: configure npm Trusted Publishing** for `@banzami/sdk`,
trusting `banza-protocol/banzami` → `.github/workflows/sdk-publish.yml` →
environment `sdk-release`. Short-lived OIDC token, **no stored secret, no 2FA
prompt, and provenance attestation** — which the current owner-run path cannot
produce.

Sub-decisions:

- keep `sdk-release` required reviewers (owner *approves*, does not *execute*),
  or remove them for full autonomy?
- extend the same model to pub.dev and PyPI?
- Go needs nothing — a version tag is the release. Do it first?

---

## D5 · SDK scope and licensing

CLAUDE.md §13 mandates six SDKs; four have no release path (VL-012), and Go/PHP/
Python declare MIT in their manifests while `LICENSE` enumerates only TypeScript
and Dart as published MIT packages (VL-013).

- **(a)** publish all four and add them to `LICENSE` *(recommended — it is what
  §13 says)*;
- **(b)** publish Go only (cheapest) and mark PHP/Python `preview`;
- **(c)** reclassify PHP/Python/Go as future and amend §13.

Whichever is chosen, the licensing inconsistency must be fixed **before**
publication, not after.

---

## D6 · `sandbox-operator.banzami.com`

Published host, TLS terminating, **no backend** (VL-009). Deploy the service, or
retire the host through `check-retired-surfaces`?

---

## D7 · Actor roster

[05](05-actor-spec.md) proposes nine, with three departures from the prompt:

- **no `DOA01`/`DOA02`** — DOA users are DOA's identities, not Banzami's;
  registering them would encode the coupling S14 exists to disprove;
- **consumers have no email** — `POST /v1/auth/register` needs only handle, name
  and PIN;
- **one operator `A01`**, creating short-lived operators through the product's
  own lifecycle for RBAC negatives, rather than a standing operator per role.

Confirm, or name the additions you want.

---

## D8 · Handles and names

```
@e2ec01 @e2ec02 @e2ec03      @e2eb01 @e2eb02 @e2eb03
display name: "Validation Actor C01"
```

Verified: 3–30 chars, lowercase, no collision with the 43 reserved `SYSTEM`
handles. These appear on public profiles and receipts — confirm they read as
unmistakably synthetic.

---

## D9 · Evidence retention

[10](10-run-resource-retention.md) §5 proposes operational periods (Golden
indefinite; failed-run binaries 180 d; Repair 90 d; Targeted 30 d; financial
evidence **always** indefinite).

No legal retention policy exists in the repository, and none is invented here.
Confirm these operational periods, or point at a policy that should govern them.

---

## D10 · Route and navigation naming

`/validation`, sidebar section **Validação**, Portuguese item labels matching the
rest of BANZADMIN, with *Validation Lab* as the English product name in
documentation. Confirm.

---

## D11 · Native device coverage

Routine validation runs the Web build of the shared Flutter source
([18](18-existing-tooling-inventory.md) §6). Native keeps build/compile/platform
gates. Only native camera capture is genuinely device-bound (MLKit/arm64
simulator limitation).

- **(a)** classify native camera `OUT_OF_SCOPE` for routine runs with a periodic
  manual device pass *(recommended)*;
- **(b)** require a device pass in every Full Run (blocks zero-human);
- **(c)** invest in a device farm.

---

## Open questions the audit could not settle

1. **Is `banzami_client` actually published to pub.dev?** `CAP-SDK-002` is
   `verified` but no published-artifact proof exists (VL-011). The Lab can check
   the registry in Phase C — but if it was never published, the capability
   status is wrong today.
2. **What is the intended lifetime of the Sandbox database?** D1's answer
   partly depends on whether it is meant to live indefinitely or be rebuilt at
   a known milestone.
3. **Should the Validation Studio be folded into BANZADMIN?** It is a
   local-only governance workstation over the implementation matrix; the
   Validation Lab is a deployed operator surface. They overlap conceptually and
   the Studio's README is stale (VL-014). Out of scope for Phase A.
4. **Does any real self-service developer depend on the Sandbox today?** The
   population reads as almost entirely synthetic plus DOA, which affects how
   aggressively D2 can proceed.

---

## Phase A final status

```
BANZAMI_VALIDATION_LAB_PHASE_A      = COMPLETE
BANZAMI_FULL_VALIDATION_SPEC_STATUS = READY_FOR_OWNER_REVIEW
IMPLEMENTATION_STARTED              = NO
VALIDATION_ACTORS_PROVISIONED       = 0
REAL_LIVE_TESTS_EXECUTED            = 0
REAL_LIVE_FINANCIAL_MUTATIONS       = 0
REAL_LIVE_INFRASTRUCTURE_MUTATIONS  = 0
```

No tag. No freeze.
